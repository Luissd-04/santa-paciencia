(function () {
  const SCHEMAS = {
    guest: {
      name:  { required: true, pattern: /^.{2,100}$/,                   message: 'Nome deve ter 2-100 caracteres' },
      email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,   message: 'Email inválido' },
    },
    reservation: {
      accommodation_id: { required: true, message: 'Selecione um alojamento' },
      check_in:         { required: true, message: 'Data de check-in obrigatória' },
      check_out:        { required: true, message: 'Data de check-out obrigatória' },
      num_guests: {
        required: true,
        validate: v => { if (Number(v) < 1) throw new Error('Mínimo 1 hóspede'); },
      },
    },
  };

  function validate(obj, schema) {
    const errors = {};
    for (const [key, rules] of Object.entries(schema)) {
      const value = obj[key];
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors[key] = 'Obrigatório';
        continue;
      }
      if (value && rules.pattern && !rules.pattern.test(value)) {
        errors[key] = rules.message;
        continue;
      }
      if (value && rules.validate) {
        try { rules.validate(value); }
        catch (e) { errors[key] = e.message; }
      }
    }
    return errors;
  }

  function hasErrors(errors) {
    return Object.keys(errors).length > 0;
  }

  window.AppValidators = { SCHEMAS, validate, hasErrors };
})();
