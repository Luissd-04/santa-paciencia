// Santa Paciência — comportamento mínimo do site. As animações são CSS;
// aqui ficam só o menu, o ano e o formulário de contacto.
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // O que já está no ecrã ao abrir a página não deve aparecer a meio de uma revelação.
  document.querySelectorAll('.reveal').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.remove('reveal'); });

  // Menu de telemóvel: fecha com Escape, ao escolher um destino ou ao tocar fora.
  const menu = $('.nav-mobile');
  if (menu) {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  }

  // Perguntas frequentes: abrir uma fecha as outras do mesmo grupo.
  document.querySelectorAll('.faq').forEach((group) => {
    group.addEventListener('toggle', (e) => {
      if (!e.target.open) return;
      group.querySelectorAll('details[open]').forEach((d) => { if (d !== e.target) d.open = false; });
    }, true);
  });

  // Formulário de contacto.
  const form = $('#form-contacto');
  if (!form) return;
  const estado = $('.form-estado', form);
  const regras = {
    nome: (v) => (v.trim().length < 2 ? 'Indique o seu nome.' : ''),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Indique um email válido, por exemplo nome@dominio.pt.'),
    mensagem: (v) => (v.trim().length < 10 ? 'Conte-nos em duas linhas o que procura.' : ''),
  };
  const validar = (campo) => {
    const regra = regras[campo.name];
    if (!regra) return true;
    const msg = regra(campo.value);
    campo.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const alvo = document.getElementById(`erro-${campo.name}`);
    if (alvo) alvo.textContent = msg;
    return !msg;
  };
  form.addEventListener('focusout', (e) => { if (e.target.name in regras) validar(e.target); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campos = [...form.elements].filter((c) => c.name in regras);
    const invalidos = campos.filter((c) => !validar(c));
    if (invalidos.length) { invalidos[0].focus(); return; }
    const dados = Object.fromEntries(new FormData(form));
    if (dados.website) return; // armadilha para robôs
    delete dados.website;
    const endpoint = form.dataset.endpoint;
    const botao = $('button[type="submit"]', form);
    estado.className = 'form-estado';
    if (!endpoint) {
      const corpo = `Nome: ${dados.nome}\nEmail: ${dados.email}\nTelefone: ${dados.telefone || '—'}\nAlojamentos: ${dados.alojamentos}\n\n${dados.mensagem}`;
      location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent('Pedido de demonstração — Santa Paciência')}&body=${encodeURIComponent(corpo)}`;
      estado.textContent = 'Abrimos o seu programa de email com a mensagem preparada. Basta enviar.';
      return;
    }
    botao.disabled = true;
    botao.dataset.rotulo = botao.textContent;
    botao.textContent = 'A enviar…';
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
      if (!r.ok) throw new Error(String(r.status));
      form.reset();
      estado.textContent = 'Recebemos o seu pedido. Respondemos em um dia útil.';
    } catch {
      estado.classList.add('falhou');
      estado.textContent = `Não foi possível enviar agora. Tente de novo ou escreva para ${form.dataset.email}.`;
    } finally {
      botao.disabled = false;
      botao.textContent = botao.dataset.rotulo;
    }
  });
})();
