let appBootstrapped = false;
let authMode = 'login';
let inviteToken = null;
let inviteUserExists = false;
let resetToken = null;

function setAuthScreenMessage(message, type = '', detail = '') {
  const el = document.getElementById('login-message');
  const box = document.getElementById('login-feedback');
  const detailEl = document.getElementById('login-message-detail');
  if (!el || !box || !detailEl) return;

  el.textContent = message || '';
  el.className = type ? `login-message ${type}` : 'login-message';
  detailEl.textContent = detail || '';
  detailEl.className = detail ? 'login-message-detail visible' : 'login-message-detail';
  box.className = message ? `login-feedback visible ${type}`.trim() : 'login-feedback';
}

function extractAuthErrorDetail(err) {
  const parts = [];
  if (err?.status) parts.push(`HTTP ${err.status}`);
  if (err?.payload && typeof err.payload === 'object') {
    if (err.payload.error && err.payload.error !== err.message) parts.push(`API: ${err.payload.error}`);
    if (err.payload.stack) parts.push(err.payload.stack);
  }
  if (!parts.length && err?.message) parts.push(err.message);
  return parts.join('\n\n');
}

function friendlyAuthError(err) {
  // Use the server message directly — it's already in Portuguese and specific.
  const serverMsg = err?.payload?.error;
  if (serverMsg) return serverMsg;
  // Fallback for network/unexpected errors
  const raw = (err?.message || '').toLowerCase();
  if (raw.includes('failed to fetch') || raw.includes('network') || raw.includes('load'))
    return 'Sem ligação ao servidor. Verifica a tua ligação à internet e tenta de novo.';
  return err?.message || 'Não foi possível completar a operação. Tenta novamente.';
}

function setFieldError(inputId, hasError, hintText) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const field = input.closest('.auth-field');
  if (!field) return;
  field.classList.toggle('has-error', hasError);
  let hint = field.querySelector('.auth-field-hint');
  if (hasError && hintText) {
    if (!hint) { hint = document.createElement('span'); hint.className = 'auth-field-hint'; field.appendChild(hint); }
    hint.textContent = hintText;
  } else if (hint) {
    hint.remove();
  }
  if (hasError) input.focus();
}

function clearFieldErrors() {
  document.querySelectorAll('.auth-field.has-error').forEach(f => {
    f.classList.remove('has-error');
    f.querySelector('.auth-field-hint')?.remove();
  });
}

function updateOwnerUiVisibility() {
  document.querySelectorAll('[data-owner-only="true"]').forEach(el => {
    el.style.display = currentUser?.role === 'owner' ? '' : 'none';
  });
}

function updateUserBadge() {
  const nameEl = document.getElementById('auth-user-name');
  const roleEl = document.getElementById('auth-user-role');
  if (nameEl) nameEl.textContent = currentUser?.name || 'Sessão';
  if (roleEl) {
    const org = currentUser?.organization_name || '';
    const role = currentUser?.role || '';
    roleEl.textContent = [org, role].filter(Boolean).join(' · ');
  }
}

function setAuthenticatedLayout(isAuthenticated) {
  const shell = document.getElementById('auth-shell');
  const bg = document.getElementById('auth-bg-pattern');
  const layout = document.getElementById('app-layout');
  if (shell) shell.style.display = isAuthenticated ? 'none' : 'flex';
  if (bg) bg.style.display = isAuthenticated ? 'none' : 'block';
  if (layout) layout.style.display = isAuthenticated ? 'flex' : 'none';
  document.body.classList.toggle('auth-locked', !isAuthenticated);
  document.body.classList.toggle('auth-ready', isAuthenticated);
  updateUserBadge();
  updateOwnerUiVisibility();
  if (window.lucide) lucide.createIcons();
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  const isInvite   = mode === 'invite';
  const isForgot   = mode === 'forgot';
  const isReset    = mode === 'reset';

  const form         = document.getElementById('login-form');
  const nameWrap     = document.getElementById('register-name-wrap');
  const orgWrap      = document.getElementById('register-org-wrap');
  const confirmWrap  = document.getElementById('register-confirm-wrap');
  const pwWrap       = document.getElementById('auth-password-wrap');
  const resetPwWrap  = document.getElementById('reset-password-wrap');
  const resetCfWrap  = document.getElementById('reset-confirm-wrap');
  const forgotLink   = document.getElementById('forgot-link-wrap');
  const copy         = document.getElementById('auth-copy');
  const helper       = document.getElementById('auth-helper-text');
  const submitBtn    = document.getElementById('login-submit');
  const emailInput   = document.getElementById('login-email');
  const passwordInput= document.getElementById('login-password');
  const confirmInput = document.getElementById('register-confirm-password');
  const nameInput    = document.getElementById('register-name');
  const orgInput     = document.getElementById('register-organization-name');
  const tabLogin     = document.getElementById('tab-login');
  const tabRegister  = document.getElementById('tab-register');
  const inviteBanner = document.getElementById('auth-invite-banner');

  if (form) {
    form.classList.add('mode-switching');
    setTimeout(() => form.classList.remove('mode-switching'), 380);
  }

  const isNewInvite      = isInvite && !inviteUserExists;
  const isExistingInvite = isInvite && inviteUserExists;
  const hideForReset     = isForgot || isReset;

  if (nameWrap)    nameWrap.classList.toggle('is-hidden', !(isRegister || isNewInvite));
  if (orgWrap)     orgWrap.classList.toggle('is-hidden', !isRegister);
  if (confirmWrap) confirmWrap.classList.toggle('is-hidden', !(isRegister || isNewInvite));
  if (pwWrap)      pwWrap.classList.toggle('is-hidden', hideForReset);
  if (resetPwWrap) resetPwWrap.classList.toggle('is-hidden', !isReset);
  if (resetCfWrap) resetCfWrap.classList.toggle('is-hidden', !isReset);
  if (forgotLink)  forgotLink.style.display = (mode === 'login') ? '' : 'none';

  const emailHidden = isReset;
  const emailWrap = emailInput?.closest('.auth-field');
  if (emailWrap) emailWrap.classList.toggle('is-hidden', emailHidden);

  if (copy) {
    copy.textContent = isReset
      ? 'Define uma nova palavra-passe para a tua conta.'
      : isForgot
        ? 'Indica o email da tua conta e enviamos-te um link para recuperar a palavra-passe.'
        : isExistingInvite
          ? 'Já tens conta no Santa Paciência. Confirma a tua identidade com a tua password para aceitar o convite.'
          : isInvite
            ? 'Aceita o convite e entra diretamente no espaço para o qual foste convidado.'
            : isRegister
              ? 'Cria o teu espaço de proprietário. Depois poderás convidar gestores e funcionários.'
              : 'Entra na operação, gere a tua equipa e mantém cada propriedade organizada num espaço próprio.';
  }
  if (helper) {
    helper.textContent = isForgot || isReset
      ? ''
      : isInvite
        ? 'O papel é definido pelo proprietário. Só precisas de criar a tua conta.'
        : 'Cada proprietário cria o seu próprio espaço. Gestores e funcionários entram por convite.';
  }
  if (submitBtn) submitBtn.innerHTML = isReset
    ? `${lcIcon('key-round', 14)} Guardar nova palavra-passe`
    : isForgot
      ? `${lcIcon('mail', 14)} Enviar link de recuperação`
      : isInvite
        ? `${lcIcon('user-check', 14)} Aceitar convite`
        : isRegister
          ? `${lcIcon('building-2', 14)} Criar espaço`
          : `${lcIcon('log-in', 14)} Entrar`;

  const hideTabs = isInvite || isForgot || isReset;
  if (tabLogin)    { tabLogin.classList.toggle('active', mode === 'login'); tabLogin.style.display = hideTabs ? 'none' : ''; }
  if (tabRegister) { tabRegister.classList.toggle('active', mode === 'register'); tabRegister.style.display = hideTabs ? 'none' : ''; }
  if (inviteBanner) inviteBanner.style.display = isInvite ? '' : 'none';

  if (passwordInput) passwordInput.autocomplete = (mode === 'login' || isExistingInvite) ? 'current-password' : 'new-password';
  if (confirmInput)  confirmInput.required = isRegister || isNewInvite;
  if (nameInput)     nameInput.required = isRegister || isNewInvite;
  if (orgInput)      orgInput.required = isRegister;
  if (emailInput)    { emailInput.readOnly = isInvite; if (!emailHidden) emailInput.focus(); }

  if (isForgot && !isReset) {
    const backBtn = document.getElementById('auth-back-btn');
    if (!backBtn) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'auth-back-btn';
      btn.className = 'auth-link-btn';
      btn.textContent = '← Voltar ao login';
      btn.onclick = () => { setAuthMode('login'); btn.remove(); };
      submitBtn?.after(btn);
    }
  } else {
    document.getElementById('auth-back-btn')?.remove();
  }

  setAuthScreenMessage('');
  clearFieldErrors();
  if (window.lucide) lucide.createIcons();
}

async function fetchCurrentUser() {
  const res = await fetch(API_BASE + '/auth/me', { credentials: 'include' });
  if (!res.ok) return null;
  const payload = await res.json();
  return payload?.data?.user || null;
}

async function fetchInviteDetails(token) {
  return apiGet(`/auth/invitations/${token}`, { skipAuthRedirect: true });
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  clearFieldErrors();
  setAuthScreenMessage('');

  const name        = document.getElementById('register-name')?.value.trim() || '';
  const orgName     = document.getElementById('register-organization-name')?.value.trim() || '';
  const email       = document.getElementById('login-email')?.value.trim() || '';
  const password    = document.getElementById('login-password')?.value || '';
  const confirm     = document.getElementById('register-confirm-password')?.value || '';
  const emailRegex  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── Field-by-field validation ──
  if (authMode === 'register' && !name) {
    setFieldError('register-name', true, 'Obrigatório — introduz o teu nome completo.');
    setAuthScreenMessage('Introduz o teu nome completo para criar um espaço.', 'error');
    return;
  }
  if (authMode === 'invite' && !inviteUserExists && !name) {
    setFieldError('register-name', true, 'Obrigatório — introduz o teu nome completo.');
    setAuthScreenMessage('Introduz o teu nome para aceitar o convite.', 'error');
    return;
  }
  if (authMode === 'register' && !orgName) {
    setFieldError('register-organization-name', true, 'Obrigatório — ex: Casas da Serra, Villa Azul…');
    setAuthScreenMessage('Dá um nome ao teu espaço de alojamento.', 'error');
    return;
  }
  if (!email) {
    setFieldError('login-email', true, 'Obrigatório.');
    setAuthScreenMessage('Introduz o teu email para continuar.', 'error');
    return;
  }
  if (!emailRegex.test(email)) {
    setFieldError('login-email', true, 'Formato inválido — ex: nome@dominio.com');
    setAuthScreenMessage('O email não tem um formato válido.', 'error');
    return;
  }
  if (!password) {
    setFieldError('login-password', true, authMode === 'login' ? 'Obrigatório.' : 'Cria uma password para a tua conta.');
    setAuthScreenMessage(authMode === 'login' ? 'Introduz a tua password.' : 'Cria uma password para a tua conta.', 'error');
    return;
  }
  if ((authMode === 'register' || (authMode === 'invite' && !inviteUserExists)) && password.length < 8) {
    setFieldError('login-password', true, 'Mínimo de 8 caracteres.');
    setAuthScreenMessage('A password é demasiado curta — usa pelo menos 8 caracteres.', 'error');
    return;
  }
  const needsConfirm = authMode === 'register' || (authMode === 'invite' && !inviteUserExists);
  if (needsConfirm) {
    if (!confirm) {
      setFieldError('register-confirm-password', true, 'Repete a password que escolheste.');
      setAuthScreenMessage('Confirma a tua password antes de continuar.', 'error');
      return;
    }
    if (password !== confirm) {
      setFieldError('register-confirm-password', true, 'Não coincide com a password acima.');
      setAuthScreenMessage('As passwords não coincidem. Verifica e tenta de novo.', 'error');
      return;
    }
  }

  // ── Forgot password mode ──
  if (authMode === 'forgot') {
    if (!email) {
      setFieldError('login-email', true, 'Introduz o teu email.');
      setAuthScreenMessage('Introduz o email da tua conta.', 'error');
      return;
    }
    const submitBtn = document.getElementById('login-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'A enviar…'; }
    try {
      await apiPost('/auth/forgot-password', { email }, { skipAuthRedirect: true });
      setAuthScreenMessage('Se o email existir, receberás um link de recuperação em breve. Verifica a caixa de entrada.', 'success');
    } catch {
      setAuthScreenMessage('Não foi possível processar o pedido. Tenta de novo.', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; setAuthMode('forgot'); }
    }
    return;
  }

  // ── Reset password mode ──
  if (authMode === 'reset') {
    const newPw  = document.getElementById('reset-password')?.value || '';
    const cfmPw  = document.getElementById('reset-confirm-password')?.value || '';
    if (!newPw) { setFieldError('reset-password', true, 'Escolhe uma nova palavra-passe.'); return; }
    if (newPw.length < 8) { setFieldError('reset-password', true, 'Mínimo de 8 caracteres.'); return; }
    if (!cfmPw) { setFieldError('reset-confirm-password', true, 'Confirma a nova palavra-passe.'); return; }
    if (newPw !== cfmPw) { setFieldError('reset-confirm-password', true, 'Não coincide.'); return; }
    const submitBtn = document.getElementById('login-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'A guardar…'; }
    try {
      await apiPost('/auth/reset-password', { token: resetToken, password: newPw, confirm_password: cfmPw }, { skipAuthRedirect: true });
      resetToken = null;
      history.replaceState({}, '', '/');
      setAuthScreenMessage('Palavra-passe alterada com sucesso! Podes entrar agora.', 'success');
      setAuthMode('login');
    } catch (err) {
      setAuthScreenMessage(friendlyAuthError(err), 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; }
    }
    return;
  }

  const submitBtn = document.getElementById('login-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'invite' ? 'A aceitar convite…' : authMode === 'register' ? 'A criar espaço…' : 'A entrar…';
  }

  try {
    const payload = authMode === 'invite'
      ? await apiPost('/auth/invitations/accept', { token: inviteToken, name, password, confirm_password: confirm }, { skipAuthRedirect: true })
      : authMode === 'register'
        ? await apiPost('/auth/register', { name, organization_name: orgName, email, password, confirm_password: confirm }, { skipAuthRedirect: true })
        : await apiPost('/auth/login', { email, password }, { skipAuthRedirect: true });
    currentUser = payload?.data?.user || null;
    // Tell the browser to offer to save/update credentials
    if (window.PasswordCredential && (authMode === 'login' || authMode === 'register' || authMode === 'invite')) {
      try {
        const cred = new PasswordCredential({ id: email, password });
        await navigator.credentials.store(cred);
      } catch (_) {}
    }
    setAuthenticatedLayout(true);
    await bootstrapApp();
    setAuthScreenMessage('');
  } catch (err) {
    const msg = friendlyAuthError(err);
    setAuthScreenMessage(msg, 'error');
    // Highlight likely field based on error content
    const raw = (err?.payload?.error || err?.message || '').toLowerCase();
    if (raw.includes('email')) setFieldError('login-email', true);
    else if (raw.includes('password') || raw.includes('credentials')) setFieldError('login-password', true);
    currentUser = null;
    setAuthenticatedLayout(false);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      setAuthMode(authMode);
    }
  }
}

async function logout() {
  try {
    await fetch(API_BASE + '/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (_) {}

  currentUser = null;
  setAuthenticatedLayout(false);
  setAuthMode(inviteToken ? 'invite' : 'login');
  setAuthScreenMessage('Sessão terminada.', 'info');
}

async function handleUnauthorized() {
  currentUser = null;
  setAuthenticatedLayout(false);
  setAuthMode(inviteToken ? 'invite' : 'login');
  setAuthScreenMessage('A tua sessão expirou. Entra novamente para continuar.', 'error');
}

let _userMemberships = [];

async function loadMemberships() {
  try {
    const payload = await apiGet('/auth/memberships');
    _userMemberships = payload?.data?.memberships || [];
  } catch (_) {
    _userMemberships = [];
  }
  renderOrgSwitcher();
}

function renderOrgSwitcher() {
  const el = document.getElementById('org-switcher');
  if (!el) return;
  if (_userMemberships.length <= 1) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const currentOrgId = currentUser?.organization_id;
  el.innerHTML = `
    <div class="org-switcher-label sb-label">Espaço ativo</div>
    <div class="org-switcher-dropdown">
      <button class="org-switcher-btn" onclick="toggleOrgMenu(event)">
        <span class="org-switcher-name">${currentUser?.organization_name || '—'}</span>
        <i data-lucide="chevrons-up-down" style="width:14px;height:14px;flex-shrink:0;"></i>
      </button>
      <div class="org-switcher-menu" id="org-menu" style="display:none;">
        ${_userMemberships.map(m => `
          <button class="org-menu-item${m.organization_id === currentOrgId ? ' active' : ''}"
            onclick="switchOrg('${m.organization_id}')">
            <span>${m.organization_name}</span>
            <span class="org-menu-role">${m.role}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function toggleOrgMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('org-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : '';
}

async function switchOrg(organizationId) {
  const menu = document.getElementById('org-menu');
  if (menu) menu.style.display = 'none';
  if (organizationId === currentUser?.organization_id) return;
  try {
    const payload = await apiPost('/auth/switch-org', { organization_id: organizationId });
    currentUser = payload?.data?.user || null;
    updateUserBadge();
    updateOwnerUiVisibility();
    await loadAccommodations();
    await renderDashboard();
    if (currentUser?.role === 'owner') await loadTeamOverview();
    await loadMemberships();
  } catch (err) {
    alert(err?.payload?.error || 'Não foi possível mudar de espaço.');
  }
}

async function bootstrapApp() {
  if (!appBootstrapped) {
    appBootstrapped = true;
    await initApp();
    await loadMemberships();
    startNotifPolling();
    return;
  }

  await loadAccommodations();
  await renderDashboard();
  if (currentUser?.role === 'owner') await loadTeamOverview();
  await loadMemberships();
  startNotifPolling();
}

async function prepareInviteMode(token) {
  const inviteBanner = document.getElementById('auth-invite-banner');
  const emailInput = document.getElementById('login-email');
  try {
    const payload = await fetchInviteDetails(token);
    const info = payload?.data;
    inviteToken = token;
    inviteUserExists = !!info.user_exists;
    if (emailInput) emailInput.value = info.email || '';
    if (inviteBanner) {
      inviteBanner.style.display = '';
      inviteBanner.innerHTML = `
        <strong>Convite para ${info.organization_name}</strong><br>
        Vais entrar como <strong>${info.role}</strong>.
        ${info.user_exists ? '<br><em>Já tens conta — confirma apenas com a tua password.</em>' : ''}
      `;
    }
    setAuthMode('invite');
  } catch (err) {
    inviteToken = null;
    inviteUserExists = false;
    if (inviteBanner) {
      inviteBanner.style.display = '';
      inviteBanner.textContent = err?.payload?.error || 'Este convite já não está disponível.';
    }
    setAuthMode('login');
  }
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  const icon = btn.querySelector('i[data-lucide]');
  if (icon) { icon.setAttribute('data-lucide', show ? 'eye-off' : 'eye'); if (window.lucide) lucide.createIcons(); }
}

async function prepareResetMode(token) {
  try {
    const payload = await apiGet(`/auth/reset-password/${token}`, { skipAuthRedirect: true });
    resetToken = token;
    const emailInput = document.getElementById('login-email');
    if (emailInput) emailInput.value = payload?.data?.email || '';
    setAuthMode('reset');
  } catch (err) {
    resetToken = null;
    setAuthMode('login');
    setAuthScreenMessage(err?.payload?.error || 'Este link de recuperação é inválido ou já expirou.', 'error');
  }
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

function openChangePasswordModal() {
  document.getElementById('user-menu').style.display = 'none';
  ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fb = document.getElementById('cp-feedback');
  if (fb) { fb.style.display = 'none'; fb.textContent = ''; }
  document.getElementById('change-password-modal').style.display = 'flex';
  document.getElementById('cp-current')?.focus();
}

function closeChangePasswordModal() {
  document.getElementById('change-password-modal').style.display = 'none';
}

async function submitChangePassword() {
  const current = document.getElementById('cp-current')?.value || '';
  const newPw   = document.getElementById('cp-new')?.value || '';
  const confirm = document.getElementById('cp-confirm')?.value || '';
  const fb      = document.getElementById('cp-feedback');

  function showCpMsg(msg, ok) {
    fb.textContent = msg;
    fb.style.display = '';
    fb.style.color = ok ? 'var(--verde, #2a7d4f)' : 'var(--vermelho, #c0392b)';
  }

  if (!current || !newPw || !confirm) { showCpMsg('Preenche todos os campos.'); return; }
  if (newPw.length < 8) { showCpMsg('A nova password precisa de ter pelo menos 8 caracteres.'); return; }
  if (newPw !== confirm) { showCpMsg('As passwords não coincidem.'); return; }

  const btn = document.getElementById('cp-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'A guardar…'; }
  try {
    await apiPost('/auth/change-password', { current_password: current, password: newPw, confirm_password: confirm });
    showCpMsg('Palavra-passe alterada com sucesso!', true);
    setTimeout(() => closeChangePasswordModal(), 1500);
  } catch (err) {
    showCpMsg(err?.payload?.error || 'Não foi possível alterar a palavra-passe.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="key-round" style="width:14px;height:14px;"></i> Alterar'; if (window.lucide) lucide.createIcons(); }
  }
}

async function boot() {
  const form = document.getElementById('login-form');
  if (form) form.addEventListener('submit', handleLoginSubmit);
  document.getElementById('tab-login')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => setAuthMode('register'));
  document.addEventListener('click', function(e) {
    const orgMenu = document.getElementById('org-menu');
    if (orgMenu && orgMenu.style.display !== 'none') {
      if (!orgMenu.closest('.org-switcher-dropdown')?.contains(e.target)) orgMenu.style.display = 'none';
    }
    const userMenu = document.getElementById('user-menu');
    if (userMenu && userMenu.style.display !== 'none') {
      if (!e.target.closest('#auth-user-chip')) userMenu.style.display = 'none';
    }
  });

  const params = new URLSearchParams(window.location.search);
  const inviteParam = params.get('invite');
  const resetParam  = params.get('reset');
  if (inviteParam) {
    await prepareInviteMode(inviteParam);
  } else if (resetParam) {
    await prepareResetMode(resetParam);
  } else {
    setAuthMode('login');
  }

  currentUser = await fetchCurrentUser();
  if (currentUser) {
    setAuthenticatedLayout(true);
    await bootstrapApp();
  } else {
    setAuthenticatedLayout(false);
  }

  if (window.lucide) lucide.createIcons();
}
