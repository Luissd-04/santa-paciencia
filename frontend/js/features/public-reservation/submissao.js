// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  nextStep: { get: () => nextStep },
  prevStep: { get: () => prevStep },
  renderStep: { get: () => renderStep },
});

function renderStep(focus = false) {
  document.querySelectorAll('.form-step').forEach(step => step.classList.toggle('active', Number(step.dataset.step) === AppModules.booking.state.step));
  document.querySelectorAll('[data-step-dot]').forEach(dot => dot.classList.toggle('active', Number(dot.dataset.stepDot) === AppModules.booking.state.step));
  AppModules.booking.$('prev-btn').style.display = AppModules.booking.state.step > 1 ? '' : 'none';
  AppModules.booking.$('next-btn').textContent = AppModules.booking.state.step === 3
    ? (AppModules.booking.state.onlinePayment ? 'Reservar e continuar para pagamento' : 'Enviar pedido') : 'Seguinte';
  if (AppModules.booking.state.step === 3) AppModules.booking.renderTurnstile();
  if (focus) AppModules.publicFlow.focusStep(document.querySelector('.form-step.active h2'));
}

function nextStep() {
  if (AppModules.booking.$('next-btn').disabled) return;
  if (!validateStep()) return;
  if (AppModules.booking.state.step === 3) return submitReservation();
  AppModules.booking.state.step++;
  renderStep(true);
}

function prevStep() {
  if (AppModules.booking.$('prev-btn').disabled) return;
  if (AppModules.booking.state.step > 1) {
    AppModules.booking.clearStepError();
    AppModules.booking.state.step--;
    renderStep(true);
  }
}

function validateStep() {
  AppModules.booking.clearStepError();
  if (AppModules.booking.state.step === 1) {
    if (!AppModules.booking.iso(AppModules.booking.$('pb-checkin').value) || !AppModules.booking.iso(AppModules.booking.$('pb-checkout').value) || AppModules.booking.nights() <= 0) { AppModules.booking.showStepError('Escolha datas válidas.'); return false; }
    const _minN = Number(AppModules.booking.selectedUnit()?.min_nights || AppModules.booking.state.property?.min_nights || 1);
    if (AppModules.booking.nights() < _minN) { AppModules.booking.showStepError(`A estadia mínima é de ${_minN} noite${_minN !== 1 ? 's' : ''}.`); return false; }
    if (!AppModules.booking.state.selectedUnitId) { AppModules.booking.showStepError('Escolha um alojamento disponível.'); return false; }
  }
  if (AppModules.booking.state.step === 2) {
    const name = AppModules.booking.$('pb-name').value.trim();
    const email = AppModules.booking.$('pb-email').value.trim();
    const phone = AppModules.booking.$('pb-phone').value.trim();
    const country = AppModules.booking.$('pb-country').value.trim();

    if (!name || !email || !phone || !country) {
      AppModules.booking.showStepError('Preencha todos os campos obrigatórios (*) do hóspede principal.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      AppModules.booking.showStepError('Email inválido.');
      return false;
    }

    const guestSections = Array.from(document.querySelectorAll('.extra-guest-box'));
    for (let i = 0; i < guestSections.length; i++) {
      const section = guestSections[i];
      const idx = Number(section.dataset.guestIndex);
      const guestName = section.querySelector('[data-field="name"]').value.trim();
      const guestEmail = section.querySelector('[data-field="email"]').value.trim();
      const guestPhone = section.querySelector('[data-field="phone"]').value.trim();
      const guestCountry = section.querySelector('[data-field="country"]').value.trim();

      if (!guestName || !guestEmail || !guestPhone || !guestCountry) {
        AppModules.booking.showStepError(`Preencha todos os campos obrigatórios (*) do hóspede ${idx}.`);
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        AppModules.booking.showStepError(`Email inválido para hóspede ${idx}.`);
        return false;
      }
    }
  }
  if (AppModules.booking.state.step === 3 && !AppModules.booking.$('pb-rgpd').checked) { AppModules.booking.showStepError('É necessário aceitar o RGPD.'); return false; }
  return true;
}

function collectPayload() {
  const nameParts = AppModules.booking.$('pb-name').value.trim().split(' ');
  const accommodationId = AppModules.booking.state.selectedUnitId === AppModules.booking.state.property?.id ? 'property' : AppModules.booking.state.selectedUnitId;
  const phoneCode = AppModules.booking.$('pb-phone-code').value;
  const phone = AppModules.booking.$('pb-phone').value.trim();

  const payload = {
    accommodation_id: accommodationId,
    check_in: AppModules.booking.iso(AppModules.booking.$('pb-checkin').value),
    check_out: AppModules.booking.iso(AppModules.booking.$('pb-checkout').value),
    num_guests: AppModules.booking.totalGuests(),
    num_adults: Number(AppModules.booking.$('pb-adults').value) || 1,
    num_children: Number(AppModules.booking.$('pb-children').value) || 0,
    breakfast_included: false,
    // O servidor volta sempre a validar o código. Enviar o valor escrito evita
    // perder o voucher quando o hóspede não carrega primeiro em «Aplicar».
    voucher_code: AppModules.booking.$('pb-voucher')?.value.trim().toUpperCase() || null,
    notes: AppModules.booking.$('pb-notes').value.trim() || null,
    rgpd_consent: AppModules.booking.$('pb-rgpd').checked,
    captcha_token: AppModules.booking._turnstileToken || null,
    // Anti-bot
    hp_website: AppModules.booking.$('pb-hp')?.value || '',
    elapsed_ms: Date.now() - AppModules.booking.state.pageLoadedAt,
    guest: {
      name: AppModules.booking.$('pb-name').value.trim(),
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' '),
      email: AppModules.booking.$('pb-email').value.trim(),
      phone: phone ? `${phoneCode} ${phone}` : null,
      nationality: AppModules.booking.$('pb-country').value.trim(),
      birth_date: AppModules.booking.iso(AppModules.booking.$('pb-birth').value) || null
    },
    guests_data: Array.from(document.querySelectorAll('.extra-guest-box')).map(guestSection => {
      const fullName = guestSection.querySelector('[data-field="name"]').value.trim();
      const parts = fullName.split(' ');
      const guestPhoneCode = guestSection.querySelector('input[data-field="phone_code"]').value;
      const guestPhone = guestSection.querySelector('[data-field="phone"]').value.trim();
      return {
        name: fullName,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' '),
        email: guestSection.querySelector('[data-field="email"]').value.trim(),
        phone: guestPhone ? `${guestPhoneCode} ${guestPhone}` : null,
        nationality: guestSection.querySelector('[data-field="country"]').value.trim(),
        birth_date: AppModules.booking.iso(guestSection.querySelector('[data-field="birth_date"]').value) || null
      };
    })
  };
  return payload;
}

async function submitReservation() {
  const btn = AppModules.booking.$('next-btn');
  if (AppModules.booking.state.captcha?.site_key && !AppModules.booking._turnstileToken) {
    AppModules.booking.showStepError('Por favor confirma que não és um robô (CAPTCHA).');
    return;
  }
  try {
    const payload = collectPayload();
    AppUI.setButtonLoading(btn, true, 'A processar...');
    AppModules.booking.$('prev-btn').disabled = true;

    const result = await AppModules.booking.api(`/api/public/booking/${AppModules.booking.state.slug}/reservations`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.data.online_payment_available && /^[a-f0-9]{64}$/i.test(result.data.public_token || '')) {
      location.assign(`/reserva/${result.data.public_token}`);
      return;
    }
    AppModules.publicFlow.complete('reserva', {
      reference: result.data.id,
      total: AppModules.booking.fmtCurrency(result.data.total_amount),
    });
  } catch (err) {
    AppModules.booking.showStepError('Erro ao enviar pedido: ' + err.message);
    AppUI.setButtonLoading(btn, false);
    AppModules.booking.$('prev-btn').disabled = false;
    AppModules.booking.resetTurnstile();
  }
}


AppModules.publicFlow.setupNavigation();
AppModules.booking.init();

})();
