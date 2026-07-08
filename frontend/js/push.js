// ── PUSH NOTIFICATIONS (Web Push) ──

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function pushIsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isIosWithoutInstall() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isStandalone;
}

// Garante um service worker registado e ativo (regista se necessário).
// Nunca usar `navigator.serviceWorker.ready` diretamente: se não houver
// registo, essa promise fica pendurada para sempre.
async function getPushRegistration() {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register('/service-worker.js');
  await navigator.serviceWorker.ready;
  return reg;
}

async function getPushSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// ── Lista de dispositivos subscritos (organização) ──

async function loadPushDevices() {
  const wrap = document.getElementById('push-devices-list');
  if (!wrap) return;
  try {
    const [{ data: devices }, ownSub] = await Promise.all([
      apiGet('/api/push/devices'),
      getPushSubscription().catch(() => null),
    ]);
    const ownTail = ownSub?.endpoint ? ownSub.endpoint.slice(-16) : null;

    if (!devices.length) {
      wrap.innerHTML = '<div style="font-size:13px;color:var(--cinza);">Nenhum dispositivo subscrito ainda.</div>';
      return;
    }

    wrap.innerHTML = devices.map(d => {
      const isThis = ownTail && d.endpoint_tail === ownTail;
      const since = d.created_at ? new Date(d.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('pt-PT') : '';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--cinza-claro);${d.active ? '' : 'opacity:.55;'}">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <i data-lucide="${/iPhone|iPad|Android/.test(d.device_name) ? 'smartphone' : 'monitor'}" style="width:17px;height:17px;color:var(--cinza);flex-shrink:0;"></i>
            <div style="min-width:0;">
              <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${escapeHtml(d.device_name)}
                ${isThis ? '<span style="font-size:10.5px;font-weight:700;color:var(--marca);background:rgba(132,52,36,.09);border-radius:10px;padding:1px 7px;margin-left:6px;">este dispositivo</span>' : ''}
              </div>
              <div style="font-size:11.5px;color:var(--cinza);">${escapeHtml(d.user_name)}${since ? ` · desde ${since}` : ''}${d.active ? '' : ' · pausado'}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <label class="toggle-switch" title="${d.active ? 'Pausar notificações neste dispositivo' : 'Reativar notificações neste dispositivo'}">
              <input type="checkbox" ${d.active ? 'checked' : ''} onchange="togglePushDevice('${d.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-ghost btn-sm" style="color:var(--vermelho);padding:4px 8px;" onclick="removePushDevice('${d.id}', ${isThis ? 'true' : 'false'})" title="Remover dispositivo">
              <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
            </button>
          </div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch {
    wrap.innerHTML = '<div style="font-size:13px;color:var(--cinza);">Não foi possível carregar os dispositivos.</div>';
  }
}

async function togglePushDevice(id, active) {
  try {
    await apiPut(`/api/push/devices/${id}`, { active });
    toast(active ? '🔔 Dispositivo reativado.' : '🔕 Dispositivo pausado.', 'success');
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao atualizar dispositivo.'), 'error');
  } finally {
    loadPushDevices();
  }
}

async function removePushDevice(id, isThisDevice) {
  if (!confirm('Remover este dispositivo? Para voltar a receber notificações nele será preciso ativá-las de novo nesse aparelho.')) return;
  try {
    await apiDelete(`/api/push/devices/${id}`);
    // Se for o próprio dispositivo, limpar também a subscrição local do browser
    if (isThisDevice) {
      const sub = await getPushSubscription().catch(() => null);
      if (sub) await sub.unsubscribe().catch(() => {});
    }
    toast('🗑 Dispositivo removido.', 'info');
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao remover dispositivo.'), 'error');
  } finally {
    loadPushDevices();
    initPushSettings();
  }
}

async function loadPushPrefs() {
  try {
    const { data } = await apiGet('/api/push/prefs');
    document.querySelectorAll('[data-push-pref]').forEach(input => {
      input.checked = data[input.dataset.pushPref] !== false;
    });
  } catch {}
}

async function savePushPrefs() {
  const prefs = {};
  document.querySelectorAll('[data-push-pref]').forEach(input => {
    prefs[input.dataset.pushPref] = input.checked;
  });
  try {
    await apiPost('/api/push/prefs', prefs);
    toast('✅ Preferências de notificações guardadas.', 'success');
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao guardar preferências.'), 'error');
  }
}

async function initPushSettings() {
  const badge = document.getElementById('push-badge');
  const enableBtn = document.getElementById('push-enable-btn');
  const disableBtn = document.getElementById('push-disable-btn');
  const hint = document.getElementById('push-ios-hint');
  if (!badge) return;

  const setBadge = (cls, label) => { badge.innerHTML = `<span class="dot ${cls}"></span> ${label}`; };

  if (hint) hint.style.display = isIosWithoutInstall() ? '' : 'none';
  loadPushPrefs();
  loadPushDevices();

  if (!pushIsSupported()) {
    setBadge('dot-red', 'Não suportado neste browser');
    if (enableBtn) enableBtn.style.display = 'none';
    if (disableBtn) disableBtn.style.display = 'none';
    return;
  }

  if (Notification.permission === 'denied') {
    setBadge('dot-red', 'Bloqueado nas definições do browser');
    if (enableBtn) enableBtn.style.display = 'none';
    if (disableBtn) disableBtn.style.display = 'none';
    return;
  }

  try {
    const sub = await getPushSubscription();
    const active = !!sub;
    setBadge(active ? 'dot-green' : 'dot-red', active ? 'Ativas neste dispositivo' : 'Desligadas');
    if (enableBtn) enableBtn.style.display = active ? 'none' : '';
    if (disableBtn) disableBtn.style.display = active ? '' : 'none';
  } catch {
    setBadge('dot-red', 'Desligadas');
  }
}

async function enablePushNotifications() {
  const btn = document.getElementById('push-enable-btn');
  if (!pushIsSupported()) {
    toast('❌ Este browser não suporta notificações push.', 'error');
    return;
  }
  if (isIosWithoutInstall()) {
    toast('⚠️ No iPhone, abra a app a partir do ecrã inicial para ativar notificações.', 'error');
    return;
  }

  AppUI.setButtonLoading(btn, true, 'A ativar...');
  try {
    // O pedido de permissão tem de acontecer em resposta ao clique (obrigatório no iOS)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast('⚠️ Permissão de notificações recusada.', 'error');
      return;
    }

    const { data } = await apiGet('/api/push/public-key');
    const reg = await getPushRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }

    await apiPost('/api/push/subscribe', { subscription: sub.toJSON() });
    toast('✅ Notificações ativadas neste dispositivo.', 'success');
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || err?.message || 'Erro ao ativar notificações.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
    initPushSettings();
  }
}

async function disablePushNotifications() {
  const btn = document.getElementById('push-disable-btn');
  AppUI.setButtonLoading(btn, true, 'A desligar...');
  try {
    const sub = await getPushSubscription();
    if (sub) {
      await apiPost('/api/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    toast('🔕 Notificações desligadas neste dispositivo.', 'success');
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao desligar notificações.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
    initPushSettings();
  }
}

async function sendTestPush() {
  const btn = document.getElementById('push-test-btn');
  const input = document.getElementById('push-test-message');
  const message = input?.value.trim();
  if (!message) {
    toast('⚠️ Escreva uma mensagem primeiro.', 'error');
    return;
  }

  AppUI.setButtonLoading(btn, true, 'A enviar...');
  try {
    const { data } = await apiPost('/api/push/test', { message });
    toast(`✅ Enviada para ${data.sent} dispositivo${data.sent === 1 ? '' : 's'}.`, 'success');
    input.value = '';
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao enviar notificação.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}
