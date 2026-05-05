let appBootstrapped = false;
let authMode = 'login';
let inviteToken = null;

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
  const isInvite = mode === 'invite';
  const form = document.getElementById('login-form');
  const nameWrap = document.getElementById('register-name-wrap');
  const orgWrap = document.getElementById('register-org-wrap');
  const confirmWrap = document.getElementById('register-confirm-wrap');
  const copy = document.getElementById('auth-copy');
  const helper = document.getElementById('auth-helper-text');
  const submitBtn = document.getElementById('login-submit');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const confirmInput = document.getElementById('register-confirm-password');
  const nameInput = document.getElementById('register-name');
  const orgInput = document.getElementById('register-organization-name');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const inviteBanner = document.getElementById('auth-invite-banner');

  if (form) {
    form.classList.add('mode-switching');
    setTimeout(() => form.classList.remove('mode-switching'), 380);
  }

  if (nameWrap) nameWrap.classList.toggle('is-hidden', !(isRegister || isInvite));
  if (orgWrap) orgWrap.classList.toggle('is-hidden', !isRegister);
  if (confirmWrap) confirmWrap.classList.toggle('is-hidden', !(isRegister || isInvite));
  if (copy) {
    copy.textContent = isInvite
      ? 'Aceita o convite e entra diretamente no espaço para o qual foste convidado.'
      : isRegister
        ? 'Cria o teu espaço de proprietário. Depois poderás convidar gestores e funcionários.'
        : 'Entra na operação, gere a tua equipa e mantém cada propriedade organizada num espaço próprio.';
  }
  if (helper) {
    helper.textContent = isInvite
      ? 'O papel é definido pelo proprietário. Só precisas de criar a tua conta.'
      : 'Cada proprietário cria o seu próprio espaço. Gestores e funcionários entram por convite.';
  }
  if (submitBtn) submitBtn.innerHTML = isInvite
    ? `${lcIcon('user-check', 14)} Aceitar convite`
    : isRegister
      ? `${lcIcon('building-2', 14)} Criar espaço`
      : `${lcIcon('log-in', 14)} Entrar`;
  if (tabLogin) tabLogin.classList.toggle('active', mode === 'login');
  if (tabRegister) tabRegister.classList.toggle('active', mode === 'register');
  if (tabLogin) tabLogin.style.display = isInvite ? 'none' : '';
  if (tabRegister) tabRegister.style.display = isInvite ? 'none' : '';
  if (inviteBanner) inviteBanner.style.display = isInvite ? '' : 'none';
  if (passwordInput) passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  if (confirmInput) confirmInput.required = isRegister || isInvite;
  if (nameInput) nameInput.required = isRegister || isInvite;
  if (orgInput) orgInput.required = isRegister;
  if (emailInput) {
    emailInput.readOnly = isInvite;
    emailInput.focus();
  }
  setAuthScreenMessage('');
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

  const payloadBody = {
    name: document.getElementById('register-name')?.value || '',
    organization_name: document.getElementById('register-organization-name')?.value || '',
    email: document.getElementById('login-email')?.value || '',
    password: document.getElementById('login-password')?.value || '',
    confirm_password: document.getElementById('register-confirm-password')?.value || '',
  };
  const submitBtn = document.getElementById('login-submit');

  setAuthScreenMessage('');

  if (authMode === 'register' || authMode === 'invite') {
    if (!payloadBody.password || !payloadBody.confirm_password) {
      setAuthScreenMessage('Preenche e confirma a senha para continuar.', 'error');
      return;
    }
    if (payloadBody.password !== payloadBody.confirm_password) {
      setAuthScreenMessage('As senhas não coincidem.', 'error');
      return;
    }
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'invite'
      ? 'A aceitar convite...'
      : authMode === 'register'
        ? 'A criar espaço...'
        : 'A entrar...';
  }

  try {
    const payload = authMode === 'invite'
      ? await apiPost('/auth/invitations/accept', {
          token: inviteToken,
          name: payloadBody.name,
          password: payloadBody.password,
          confirm_password: payloadBody.confirm_password
        }, { skipAuthRedirect: true })
      : authMode === 'register'
        ? await apiPost('/auth/register', payloadBody, { skipAuthRedirect: true })
        : await apiPost('/auth/login', {
            email: payloadBody.email,
            password: payloadBody.password
          }, { skipAuthRedirect: true });
    currentUser = payload?.data?.user || null;
    setAuthenticatedLayout(true);
    await bootstrapApp();
    setAuthScreenMessage('');
  } catch (err) {
    setAuthScreenMessage(
      err?.payload?.error || err.message || 'Não foi possível autenticar.',
      'error',
      extractAuthErrorDetail(err)
    );
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

async function bootstrapApp() {
  if (!appBootstrapped) {
    appBootstrapped = true;
    await initApp();
    return;
  }

  await loadAccommodations();
  await renderDashboard();
  if (currentUser?.role === 'owner') await loadTeamOverview();
}

async function prepareInviteMode(token) {
  const inviteBanner = document.getElementById('auth-invite-banner');
  const emailInput = document.getElementById('login-email');
  try {
    const payload = await fetchInviteDetails(token);
    const info = payload?.data;
    inviteToken = token;
    if (emailInput) emailInput.value = info.email || '';
    if (inviteBanner) {
      inviteBanner.style.display = '';
      inviteBanner.innerHTML = `
        <strong>Convite para ${info.organization_name}</strong><br>
        Vais entrar como <strong>${info.role}</strong>.
      `;
    }
    setAuthMode('invite');
  } catch (err) {
    inviteToken = null;
    if (inviteBanner) {
      inviteBanner.style.display = '';
      inviteBanner.textContent = err?.payload?.error || 'Este convite já não está disponível.';
    }
    setAuthMode('login');
  }
}

async function boot() {
  const form = document.getElementById('login-form');
  if (form) form.addEventListener('submit', handleLoginSubmit);
  document.getElementById('tab-login')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => setAuthMode('register'));

  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (token) {
    await prepareInviteMode(token);
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
