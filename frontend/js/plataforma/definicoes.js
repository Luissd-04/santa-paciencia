// Consola da plataforma → Definições: o que é da pessoa e não de uma área de
// trabalho. Conta e cargos, aspeto, versão instalada e terminar sessão.
// Não pede nada à API além do que o arranque já trouxe (st.user em shell.js).
(() => {
const fmt = AppModules.consola.fmt;
const { esc } = fmt;

const ROLE_LABELS = { admin: 'Administração', marketing: 'Marketing e comercial', support: 'Suporte' };
const LOOKS = [['classico', 'Clássico', 'Terracota e creme'], ['claro', 'Vidro claro', 'Translúcido, fundo claro'], ['escuro', 'Vidro escuro', 'Translúcido, fundo escuro']];

const dateTime = iso => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '');
const row = (label, value) => `<div class="pl-kv"><span>${esc(label)}</span><b>${value}</b></div>`;

function accountCard(user) {
  const roles = (user.platform_roles || []).map(role => ROLE_LABELS[role] || role);
  return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>A minha conta</h3></div>
    ${row('Nome', esc(user.name || '—'))}
    ${row('Email', esc(user.email || '—'))}
    ${row('Cargos', esc(roles.join(' · ') || '—'))}
    <p class="pl-note">Os cargos são atribuídos pela Administração, em Equipa e permissões.</p>
  </section>`;
}

function lookCard() {
  return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>Aspeto</h3></div>
    <p class="pl-note">Fica guardado na sua conta e vale também na aplicação.</p>
    <div class="pl-def-looks" id="pl-aspeto" role="group" aria-label="Aspeto da consola">
      ${LOOKS.map(([key, label, hint]) => `<button type="button" class="pl-def-look" data-look="${key}" aria-pressed="false" ${AppActions.attrs('click', 'pl-aspeto', [key])}>
        <b>${label}</b><small>${hint}</small></button>`).join('')}
    </div>
  </section>`;
}

function versionCard(user) {
  const version = user.app_version || {};
  return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>Versão instalada</h3></div>
    ${row('Versão', version.commit ? `<code>${esc(version.commit)}</code>` : 'Não indicada neste servidor')}
    ${row('Em execução desde', esc(dateTime(version.started_at) || '—'))}
    <p class="pl-note">A versão é o início do commit do Git. Compare-a com o último commit da branch para confirmar que a atualização entrou.</p>
  </section>`;
}

function sessionCard() {
  return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>Sessão</h3></div>
    <div class="pl-def-actions">
      <a class="btn btn-ghost" href="/dashboard">${fmt.icon('arrow-left', 16)}<span>Voltar à app</span></a>
      <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'pl-logout')}>${fmt.icon('log-out', 16)}<span>Terminar sessão</span></button>
    </div>
  </section>`;
}

AppModules.define('consola', {
  definicoes: {
    get: () => ({
      render(ctx) {
        const user = AppModules.consola.utilizador || {};
        ctx.host.innerHTML = `<div class="pl-page pl-def">${accountCard(user)}${lookCard()}${versionCard(user)}${sessionCard()}</div>`;
        AppModules.consola.marcarAspeto();
      },
    }),
  },
});
})();
