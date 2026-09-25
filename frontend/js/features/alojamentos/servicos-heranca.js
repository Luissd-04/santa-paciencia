// Estado privado; interface partilhada em AppModules.alojamentos.
(() => {
AppModules.define('alojamentos', {
  _applyInheritedFields: { get: () => _applyInheritedFields },
  addAlojamento: { get: () => addAlojamento },
  addServico: { get: () => addServico },
  onAlojParentChange: { get: () => onAlojParentChange },
  onAlojTipoChange: { get: () => onAlojTipoChange },
  renderServicos: { get: () => renderServicos },
});

function autoSaveServicos() {
  clearTimeout(AppModules.alojamentos._servicosTimer);
  AppModules.alojamentos._servicosTimer = setTimeout(async () => {
    try {
      const res = await AppModules.core.apiPost('/api/accommodations/settings', { services: AppModules.core.servicosData });
      if (res.success) AppModules.core.toast('💾 Serviços guardados', 'success');
    } catch (e) { /* silencioso */ }
  }, 800);
}

function renderServicos() {
  const tbody = document.getElementById('servicos-body');
  if (!tbody) return;
  const BUILTIN = ['breakfast', 'tourist_tax'];
  tbody.innerHTML = AppModules.core.servicosData.map((s, i) => {
    const isBuiltin = BUILTIN.includes(s.id);
    return `
    <tr>
      <td>
        ${isBuiltin
          ? `<span style="font-size:13px;color:var(--cinza);">${s.type === 'service' ? 'Serviço' : 'Taxa'}</span>`
          : `<select class="form-control" style="font-size:12px;padding:5px 8px;" ${AppActions.attrs("change", "servicos-heranca-auto-save-servicos-0e85039", [i])}>
               <option value="service" ${s.type === 'service' ? 'selected' : ''}>Serviço</option>
               <option value="tax"     ${s.type === 'tax'     ? 'selected' : ''}>Taxa</option>
             </select>`}
      </td>
      <td>
        ${isBuiltin
          ? `<span style="font-size:13px;color:var(--cinza);">${AppModules.core.escapeHtml(s.name)}</span>`
          : `<input class="form-control" style="font-size:13px;padding:6px 10px;" value="${AppModules.core.escapeHtml(s.name)}" ${AppActions.attrs("change", "servicos-heranca-auto-save-servicos-0bacea0", [i])} autocomplete="off">`}
      </td>
      <td><input class="form-control" type="number" step="0.01" style="font-size:13px;padding:6px 10px;-moz-appearance:textfield;width:90px;" value="${s.value}" ${AppActions.attrs("change", "servicos-heranca-parse-float-ec6e7aa", [i])} autocomplete="off"></td>
      <td><span style="font-size:13px;color:var(--cinza);">€/hóspede/noite</span></td>
      <td><label class="toggle-switch"><input type="checkbox" ${s.active !== false ? 'checked' : ''} ${AppActions.attrs("change", "servicos-heranca-auto-save-servicos-1661226", [i])}><span class="toggle-slider"></span></label></td>
      <td>
        ${isBuiltin ? '<span style="width:32px;display:inline-block;"></span>' : `
        <button ${AppActions.attrs("click", "servicos-heranca-remove-servico-1de13bb", [i])} style="background:none;border:none;cursor:pointer;color:var(--vermelho);display:flex;align-items:center;" title="Remover">
          ${AppModules.core.lcIcon('trash-2', 15)}
        </button>`}
      </td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function addServico() {
  AppModules.core.servicosData.push({ id: 'sv-' + Date.now(), name: 'Novo serviço', type: 'service', value: 0, unit: '€/hóspede/noite', active: true });
  renderServicos();
  autoSaveServicos();
}

function removeServico(i) {
  AppModules.core.servicosData.splice(i, 1);
  renderServicos();
  autoSaveServicos();
}

async function saveServicos() {
  try {
    const res = await AppModules.core.apiPost('/api/accommodations/settings', { services: AppModules.core.servicosData });
    if (res.success) {
      AppModules.core.toast('✅ Serviços e taxas guardados!', 'success');
    } else {
      AppModules.core.toast('❌ Erro ao guardar.', 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação.', 'error');
  }
}

// ── HERANÇA DE CAMPOS DO ALOJAMENTO PRINCIPAL ──
const INHERITED_FIELDS_MAP = {
  'aloj-morada':        'address',
  'aloj-cp':            'postal_code',
  'aloj-cidade':        'city',
  'aloj-regiao':        'region',
  'aloj-pais':          'country',
  'aloj-wifi-nome':     'wifi_name',
  'aloj-wifi-password': 'wifi_password',
  'aloj-door-code':     'door_code',
  'aloj-checkin-time':  'checkin_time',
  'aloj-checkout-time': 'checkout_time',
  'aloj-social-fb':     'social_facebook',
  'aloj-social-ig':     'social_instagram',
  'aloj-social-web':    'social_website',
  'aloj-social-ta':     'social_tripadvisor',
};

function onAlojTipoChange(accomData) {
  const tipo = document.getElementById('aloj-tipo')?.value;
  const parentWrap = document.getElementById('aloj-parent-wrap');
  // Alojamento type never has a parent; other types can optionally have one
  if (parentWrap) parentWrap.style.display = (tipo && tipo !== 'alojamento') ? '' : 'none';
  AppModules.alojamentos.updatePublicBookingLink(accomData || AppModules.alojamentos.currentAlojDetail);
  if (tipo === 'alojamento') {
    const parentSel = document.getElementById('aloj-parent-id');
    if (parentSel) parentSel.value = '';
    _applyInheritedFields(accomData || null);
  }
}

function onAlojParentChange() {
  const parentId = document.getElementById('aloj-parent-id')?.value;
  if (!parentId) {
    AppModules.alojamentos.currentAlojDetail = { ...(AppModules.alojamentos.currentAlojDetail || {}), parent_id: null, _parent: null, _parent_name: null, inherited_amenities: [], common_area_images: [] };
    _applyInheritedFields(null);
    AppModules.alojamentos.renderAmenities(AppModules.alojamentos.getSelectedAmenitiesFromUi(), []);
    if (document.getElementById('tab-imagens')?.classList.contains('active')) AppModules.alojamentos.renderImagens();
    return;
  }
  const parent = AppModules.core.accommodations.find(p => p.id === parentId);
  AppModules.alojamentos.currentAlojDetail = {
    ...(AppModules.alojamentos.currentAlojDetail || {}),
    parent_id: parentId,
    _parent: parent || null,
    _parent_name: parent?.name || null,
    inherited_amenities: parent?.effective_amenities || [],
    common_area_images: parent?.images?.[AppModules.alojamentos.COMMON_AREAS_SECTION.key] || []
  };
  _applyInheritedFields({ parent_id: parentId, _parent: parent });
  // Fill in inherited values from parent immediately
  if (parent) {
    Object.entries(INHERITED_FIELDS_MAP).forEach(([elId, field]) => {
      const el = document.getElementById(elId);
      if (el) el.value = parent[field] || '';
    });
    AppModules.alojamentos.renderAmenities(AppModules.alojamentos.getSelectedAmenitiesFromUi(), parent.effective_amenities || []);
    if (document.getElementById('tab-imagens')?.classList.contains('active')) AppModules.alojamentos.renderImagens();
  }
}

function _applyInheritedFields(accomData) {
  const hasParent = !!(accomData?.parent_id);
  const parent = accomData?._parent || (accomData?.parent_id ? AppModules.core.accommodations.find(p => p.id === accomData.parent_id) : null);
  const banner = document.getElementById('aloj-inherited-banner');
  const msg = document.getElementById('aloj-inherited-msg');

  if (hasParent && parent) {
    if (banner) banner.style.display = '';
    if (msg) msg.innerHTML = `${AppModules.core.lcIcon('link',13)} Os campos marcados são herdados de <b>${AppModules.core.escapeHtml(parent.name)}</b> e só podem ser editados a partir desse alojamento.`;
  } else {
    if (banner) banner.style.display = 'none';
  }

  Object.keys(INHERITED_FIELDS_MAP).forEach(elId => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.disabled = hasParent;
    el.style.opacity = hasParent ? '.55' : '';
    el.style.cursor = hasParent ? 'not-allowed' : '';
    // Ensure label shows inherited badge
    const label = el.closest('.form-group')?.querySelector('.form-label');
    const badgeId = elId + '-inherited-badge';
    const existing = document.getElementById(badgeId);
    if (hasParent && !existing && label) {
      const badge = document.createElement('span');
      badge.id = badgeId;
      badge.style.cssText = 'margin-left:6px;font-size:10px;color:var(--dourado);font-weight:600;text-transform:uppercase;letter-spacing:.3px;';
      badge.textContent = '↑ herdado';
      label.appendChild(badge);
    } else if (!hasParent && existing) {
      existing.remove();
    }
    // For password field, also affect the wrapper
    if (elId === 'aloj-wifi-password') {
      const btn = el.closest('.password-field')?.querySelector('.password-eye');
      if (btn) btn.disabled = hasParent;
    }
  });

  // email_social_links segue a mesma herança do link a que pertence (não tem
  // entrada própria em INHERITED_FIELDS_MAP: já viveria duplicado o crachá
  // "↑ herdado" no mesmo rótulo do campo de URL ao lado).
  ['aloj-social-fb-email', 'aloj-social-ig-email', 'aloj-social-web-email', 'aloj-social-ta-email'].forEach(elId => {
    const el = document.getElementById(elId);
    if (el) el.disabled = hasParent;
  });

  AppModules.alojamentos.renderAlojLogoPreview(hasParent
    ? { parent_id: accomData.parent_id, logo_url: parent?.logo_url }
    : (AppModules.alojamentos.currentAlojDetail || null));
}

// ── ADICIONAR ALOJAMENTO ──
async function addAlojamento() {
  const nome = prompt('Nome do novo alojamento:');
  if (!nome || !nome.trim()) return;
  try {
    const res = await AppModules.core.apiPost('/api/accommodations', { name: nome.trim() });
    if (res.success) {
      AppModules.core.toast('✅ Alojamento criado! Clique para configurar.', 'success');
      await AppModules.core.loadAccommodations();
      AppModules.alojamentos.renderAlojamentos();
      AppModules.alojamentos.initAlojDrag();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao criar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── EXPORTAR ALOJAMENTOS ──

AppActions.register({
  "servicos-heranca-auto-save-servicos-0e85039": (el, event, args) => { AppModules.core.servicosData[args[0]].type=el.value;autoSaveServicos() },
  "servicos-heranca-auto-save-servicos-0bacea0": (el, event, args) => { AppModules.core.servicosData[args[0]].name=el.value;autoSaveServicos() },
  "servicos-heranca-parse-float-ec6e7aa": (el, event, args) => { AppModules.core.servicosData[args[0]].value=parseFloat(el.value)||0;autoSaveServicos() },
  "servicos-heranca-auto-save-servicos-1661226": (el, event, args) => { AppModules.core.servicosData[args[0]].active=el.checked;autoSaveServicos() },
}, "change");

AppActions.register({
  "servicos-heranca-remove-servico-1de13bb": (el, event, args) => { removeServico(args[0]) },
}, "click");

})();
