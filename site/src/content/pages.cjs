const { icon, arch, cta, pageHero, mock, faq, related, brandTitle, cfg } = require('../layout.cjs');

/* ── Para quem ─────────────────────────────────────────────────────── */
const P = [
  {
    slug: 'proprietarios', ico: 'home', name: 'Proprietários',
    title: 'Software para proprietários de alojamento local',
    description: 'Gere um ou dois alojamentos nas horas vagas? Tenha reservas, hóspedes, pagamentos e despesas organizados sem folhas de cálculo.',
    h1: 'Para quem gere a casa <em>nas horas vagas</em>',
    lead: 'Tem um emprego, uma família e um alojamento que não pode falhar. A Santa Paciência trata do que se repete, para lhe sobrar tempo para o resto.',
    points: [
      ['Nada fica esquecido', 'As chegadas do dia, os sinais por receber e as limpezas por marcar aparecem logo ao abrir. Não precisa de se lembrar de procurar.'],
      ['Reservas diretas sem telefonemas', 'Partilhe a sua página de reservas com quem já o conhece. O hóspede escolhe as datas, paga o sinal e a reserva confirma-se.'],
      ['Tudo no telemóvel', 'Consulte o calendário na fila do supermercado e registe uma despesa com uma fotografia ao talão.'],
      ['Contas claras ao fim do ano', 'Receita, despesas e margem por alojamento, prontas para mostrar a quem lhe trata da contabilidade.'],
    ],
    mock: { title: 'Hoje', rows: [['Chegadas', 'Casa da Eira · Marta Silva, 16:30', '1', 'marca'], ['Saídas', 'Nenhuma hoje', '0', 'neutro'], ['Sinais por receber', 'Família Lopes · 126,00 €', '1', 'espera'], ['Limpezas marcadas', 'Sexta, 11:00 · Rosa', '1', 'ok']], foot: 'Dados de exemplo' },
    plan: 'Essencial',
    rel: [['/funcionalidades/reservas-e-calendario/', 'Reservas e calendário', 'O calendário único por alojamento.'], ['/funcionalidades/hospedes-e-pre-check-in/', 'Hóspedes e pré-check-in', 'Os dados do hóspede antes da chegada.'], ['/guias/organizar-reservas-sem-folhas-de-calculo/', 'Guia: sair da folha de cálculo', 'Como organizar as reservas passo a passo.']],
  },
  {
    slug: 'gestores-de-varias-unidades', ico: 'building', name: 'Gestores de várias unidades',
    title: 'Software para gerir vários alojamentos locais',
    description: 'Gere vários alojamentos? Um só calendário, preços por época, pagamentos online e tarefas de equipa para não perder o controlo à medida que cresce.',
    h1: 'Para quem já não consegue <em>ter tudo na cabeça</em>',
    lead: 'A partir de certa altura, cada casa a mais multiplica as mensagens, as limpezas e as contas. É aí que um sistema faz a diferença.',
    points: [
      ['Um calendário para todas as casas', 'Veja a ocupação de todos os alojamentos lado a lado e encontre noites livres em segundos, sem abrir cinco separadores.'],
      ['Preços que se mantêm sozinhos', 'Épocas, fins de semana e estadias mínimas definidos por alojamento. O total de cada reserva é sempre o certo.'],
      ['Receber sem perseguir', 'Sinal e saldo pagos por cartão, com prazos e política de cancelamento aplicados a todas as reservas diretas.'],
      ['A equipa coordenada', 'Limpezas e manutenção atribuídas com data e responsável. Quem faz, marca como feito.'],
    ],
    mock: { title: 'Ocupação · junho', rows: [['Casa da Eira', '26 de 30 noites', '87%', 'ok'], ['Quarto Azul', '22 de 30 noites', '73%', 'ok'], ['Loft do Rio', '24 de 30 noites', '80%', 'ok'], ['Casa do Forno', '17 de 30 noites', '57%', 'espera']], foot: 'Dados de exemplo' },
    plan: 'Profissional',
    rel: [['/funcionalidades/precos-por-epoca/', 'Preços por época', 'Épocas, dias da semana e estadia mínima.'], ['/funcionalidades/pagamentos-online/', 'Pagamentos online', 'Sinal e saldo por cartão.'], ['/funcionalidades/relatorios/', 'Relatórios', 'Receita e ocupação por alojamento.']],
  },
  {
    slug: 'empresas-de-gestao', ico: 'briefcase', name: 'Empresas de gestão',
    title: 'Software para empresas de gestão de alojamento local',
    description: 'Para empresas que gerem alojamentos de terceiros: equipa, departamentos e permissões, registo de ações e relatórios por alojamento.',
    h1: 'Para equipas que gerem <em>casas de outras pessoas</em>',
    lead: 'Quando há receção, limpezas, manutenção e administração, cada pessoa precisa de ver uma parte diferente do mesmo negócio.',
    points: [
      ['Permissões por função', 'A equipa operacional vê chegadas, saídas e tarefas. A gestão trata de reservas e preços. A administração vê os números.'],
      ['Departamentos', 'Organize a equipa por áreas e atribua tarefas a quem as executa, com avisos no telemóvel.'],
      ['Quem fez o quê', 'Cancelamentos, reembolsos e alterações de permissões ficam registados com autor e data.'],
      ['Números por alojamento', 'Receita, ocupação, despesas e margem de cada casa, para prestar contas a cada proprietário.'],
    ],
    mock: { title: 'Equipa', rows: [['Helena Duarte', 'Administração', 'Proprietária', 'marca'], ['Miguel Reis', 'Reservas', 'Gestor', 'neutro'], ['Rosa Pinto', 'Limpezas', 'Equipa', 'neutro'], ['Tiago Nunes', 'Manutenção', 'Equipa', 'neutro']], foot: 'Dados de exemplo' },
    plan: 'Premium',
    rel: [['/funcionalidades/equipa-e-tarefas/', 'Equipa e tarefas', 'Funções, departamentos e tarefas.'], ['/funcionalidades/relatorios/', 'Relatórios', 'Números por alojamento e por canal.'], ['/funcionalidades/despesas-e-fornecedores/', 'Despesas e fornecedores', 'O custo real de cada casa.']],
  },
];

const personaPage = (p) => ({
  path: `/para-quem/${p.slug}/`,
  title: brandTitle(p.title),
  description: p.description,
  ogHeadline: p.h1.replace(/<[^>]+>/g, ''),
  crumbs: [['/para-quem/', 'Para quem'], [`/para-quem/${p.slug}/`, p.name]],
  body: `${pageHero({ eyebrow: p.name, h1: p.h1, lead: p.lead })}
<div class="wrap">
  <section class="bloco">
    <div class="bloco-texto reveal">
      <h2>O que muda no seu dia</h2>
      <ul class="ticks">${p.points.map(([t, d]) => `<li>${icon('check')}<span><strong>${t}.</strong> ${d}</span></li>`).join('')}</ul>
    </div>
    ${mock(p.mock)}
  </section>
  <section class="bloco">
    <div class="bloco-texto reveal">
      <h2>O pacote que costuma servir</h2>
      <p>Quem tem este perfil começa quase sempre pelo pacote <strong>${p.plan}</strong>. Pode mudar de pacote quando o número de alojamentos ou de pessoas na equipa mudar.</p>
      <p><a class="link-arrow" href="/precos/">Comparar os pacotes ${icon('arrow')}</a></p>
    </div>
    <div class="bloco-arco reveal" aria-hidden="true">${icon(p.ico)}</div>
  </section>
</div>
${related('Para aprofundar', p.rel)}
${cta()}`,
});

const paraQuem = {
  path: '/para-quem/',
  title: 'Para quem é a Santa Paciência | Gestão de alojamento local',
  description: 'Proprietários com um alojamento, gestores de várias unidades e empresas de gestão: veja como a Santa Paciência se ajusta a cada caso.',
  ogHeadline: 'Do primeiro alojamento à empresa de gestão',
  crumbs: [['/para-quem/', 'Para quem']],
  body: `${pageHero({ eyebrow: 'Para quem', h1: 'Do primeiro alojamento <em>à empresa de gestão</em>', lead: 'A mesma plataforma, três maneiras de a usar. Escolha a que se parece mais com o seu dia.' })}
<section class="section papel">
  <div class="wrap">
    <div class="perfis">
      ${P.map((p) => `<a class="perfil reveal" href="/para-quem/${p.slug}/">${icon(p.ico)}<h2 class="h3">${p.name}</h2><p>${p.lead}</p><span class="link-arrow">Ver como funciona ${icon('arrow')}</span></a>`).join('\n      ')}
    </div>
  </div>
</section>
${cta()}`,
};

/* ── Preços ────────────────────────────────────────────────────────── */
const planCard = (p, tag = 'h2') => `<article class="plano reveal${p.featured ? ' plano-destaque' : ''}">
  ${p.featured ? '<span class="plano-selo">Mais escolhido</span>' : ''}
  <div class="plano-top"><${tag}>${p.name}</${tag}><p>${p.for}</p></div>
  <p class="preco"><strong>${p.price} €</strong><span>/ mês</span></p>
  <p class="plano-nota">Valor sem IVA, faturado mensalmente.</p>
  <ul>${p.limits.map((l) => `<li class="lim">${icon('check')}<span>${l}</span></li>`).join('')}${p.features.map((l) => `<li>${icon('check')}<span>${l}</span></li>`).join('')}</ul>
  <a class="btn ${p.featured ? 'btn-light' : 'btn-primary'}" href="/contacto/?pacote=${p.id}">Começar com o ${p.name}</a>
</article>`;

const sim = icon('check');
const linhas = [
  ['Alojamentos', 'Até 3', 'Até 10', 'Sem limite'],
  ['Utilizadores', '2', '5', 'Sem limite'],
  ['Reservas, calendário e preços', sim, sim, sim],
  ['Página pública de reservas', sim, sim, sim],
  ['Hóspedes e pré-check-in', sim, sim, sim],
  ['Despesas e fornecedores', sim, sim, sim],
  ['Pagamentos online (Stripe)', '—', sim, sim],
  ['Relatórios', 'Essenciais', 'Completos', 'Completos com PDF'],
  ['Apoio na configuração', 'Por email', 'Por email', 'Prioritário'],
];

const precos = {
  path: '/precos/',
  title: 'Preços e pacotes | Santa Paciência',
  description: `Três pacotes para alojamento local, a partir de ${cfg.plans[0].price} € por mês: Essencial, Profissional e Premium. Compare limites e funcionalidades.`,
  ogHeadline: 'Preços simples, por pacote',
  crumbs: [['/precos/', 'Preços']],
  software: true,
  body: `${pageHero({ eyebrow: 'Preços', h1: 'Um preço por mês, <em>sem comissões</em>', lead: 'Paga pelo pacote, não pelas reservas. O que os seus hóspedes pagam é seu.', actions: false })}
<section class="section papel" style="padding-top:3.5rem">
  <div class="wrap">
    <div class="planos">${cfg.plans.map((p) => planCard(p)).join('\n')}</div>
    <p class="precos-nota">As comissões da Stripe sobre pagamentos por cartão são cobradas pela Stripe e não estão incluídas. Pode mudar de pacote a qualquer momento.</p>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Comparar</p><h2>O que inclui <em>cada pacote</em></h2></div>
    <div class="tabela-wrap reveal" tabindex="0" role="region" aria-label="Comparação de pacotes">
      <table>
        <thead><tr><th scope="col">Funcionalidade</th>${cfg.plans.map((p) => `<th scope="col">${p.name}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map(([n, ...v]) => `<tr><th scope="row">${n}</th>${v.map((c) => `<td${c === '—' ? ' class="nao"' : ''}>${c === sim ? `${sim}<span class="hp">Incluído</span>` : c === '—' ? '<span aria-hidden="true">—</span><span class="hp">Não incluído</span>' : c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  </div>
</section>
<section class="section papel">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Dúvidas sobre preços</p><h2>Antes de <em>decidir</em></h2></div>
    ${faq([
      ['Há fidelização?', 'Não. O pagamento é mensal e pode cancelar quando quiser. Os seus dados podem ser exportados antes de sair.'],
      ['Cobram comissão sobre as reservas?', 'Não. O preço é o do pacote. Nos pagamentos por cartão, a Stripe cobra a sua própria comissão de processamento, diretamente na sua conta Stripe.'],
      ['Posso experimentar antes de pagar?', 'Sim. Depois da demonstração, criamos-lhe uma conta de experiência para testar com os seus alojamentos, sem compromisso.'],
      ['E se passar o limite de alojamentos?', 'Avisamos antes de lá chegar. Muda para o pacote seguinte e continua a trabalhar; não perde dados nem configurações.'],
    ])}
  </div>
</section>
${cta('Não sabe que pacote escolher?', 'Diga-nos quantos alojamentos gere e como trabalha. Indicamos o pacote que faz sentido e mostramos a plataforma.')}`,
};

/* ── Sobre ─────────────────────────────────────────────────────────── */
const sobre = {
  path: '/sobre/',
  title: 'Sobre a Santa Paciência | Software feito em Portugal',
  description: 'A Santa Paciência nasceu da operação diária de alojamento local. Conheça a ideia por trás da plataforma e os princípios com que é feita.',
  ogHeadline: 'Feita por quem conhece o dia a dia',
  crumbs: [['/sobre/', 'Sobre']],
  body: `${pageHero({ eyebrow: 'Sobre', h1: 'Feita para quem diz <em>«santa paciência!»</em> dez vezes por dia', lead: 'O hóspede que chega três horas antes. A máquina que avaria ao sábado. A reserva que ninguém apontou. Quem recebe pessoas conhece a expressão de cor.', actions: false })}
<section class="section papel" style="padding-top:3.5rem">
  <div class="wrap">
    <div class="prose reveal">
      <h2>De onde vem</h2>
      <p>A Santa Paciência começou como uma ferramenta interna, para resolver um problema concreto: gerir alojamentos sem viver agarrado a folhas de cálculo, mensagens e papéis. Foi crescendo à medida das necessidades reais da operação, uma de cada vez: primeiro o calendário, depois os hóspedes, os pagamentos, as despesas, a equipa.</p>
      <p>Hoje é uma plataforma completa, e continua a ser feita da mesma maneira: a partir do que acontece num alojamento a sério, e não do que fica bem numa lista de funcionalidades.</p>
      <blockquote>Um bom sistema de gestão nota-se pouco. O que se nota é o tempo que sobra.</blockquote>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Princípios</p><h2>Como <em>trabalhamos</em></h2></div>
    <ul class="valores">
      <li class="reveal"><h3>As contas têm de bater certo</h3><p>O total que o hóspede vê é o total que fica gravado. O que foi pago é o que aparece como pago. Sem exceções.</p></li>
      <li class="reveal"><h3>Nada falha em silêncio</h3><p>Se um email não saiu ou um pagamento ficou por confirmar, a plataforma diz-lhe. Não mostramos «enviado» sem ter sido.</p></li>
      <li class="reveal"><h3>Os dados são seus</h3><p>Pode exportar tudo quando quiser. Os dados dos seus hóspedes são tratados com o cuidado que a lei e o bom senso pedem.</p></li>
      <li class="reveal"><h3>Em português, para Portugal</h3><p>Feita cá, a pensar na realidade do alojamento local português, e com apoio de pessoas que falam a sua língua.</p></li>
    </ul>
  </div>
</section>
${cta()}`,
};

/* ── Contacto ──────────────────────────────────────────────────────── */
const contacto = {
  path: '/contacto/',
  title: 'Pedir demonstração e contactos | Santa Paciência',
  description: 'Peça uma demonstração da Santa Paciência. Em 30 minutos mostramos a plataforma com exemplos do seu alojamento local e respondemos às suas perguntas.',
  ogHeadline: 'Peça uma demonstração',
  crumbs: [['/contacto/', 'Contacto']],
  body: `<section class="page-hero">
  <div class="wrap contacto">
    <div>
      <p class="eyebrow">Contacto</p>
      <h1>Vamos <em>conversar</em></h1>
      <p class="lead">Conte-nos como gere os seus alojamentos. Marcamos uma demonstração de 30 minutos e mostramos como ficaria na Santa Paciência.</p>
      <ul class="contacto-lista">
        <li>${icon('clock')}<div><strong>Resposta em um dia útil</strong><span>Lemos e respondemos a todos os pedidos.</span></div></li>
        <li>${icon('phone')}<div><strong>Demonstração por videochamada</strong><span>30 minutos, à hora que lhe der jeito.</span></div></li>
        <li>${icon('mail')}<div><strong>Prefere escrever?</strong><span><a href="mailto:${cfg.email}">${cfg.email}</a></span></div></li>
      </ul>
    </div>
    <form class="form" id="form-contacto" method="post" action="${cfg.contactEndpoint || `mailto:${cfg.email}`}"${cfg.contactEndpoint ? '' : ' enctype="text/plain"'} data-endpoint="${cfg.contactEndpoint}" data-email="${cfg.email}" novalidate>
      <div class="dois">
        <div class="campo"><label for="nome">Nome <span aria-hidden="true">*</span></label><input id="nome" name="nome" type="text" autocomplete="name" required aria-describedby="erro-nome"><p class="erro" id="erro-nome" role="alert"></p></div>
        <div class="campo"><label for="email">Email <span aria-hidden="true">*</span></label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" required aria-describedby="erro-email"><p class="erro" id="erro-email" role="alert"></p></div>
      </div>
      <div class="dois">
        <div class="campo"><label for="telefone">Telefone</label><input id="telefone" name="telefone" type="tel" autocomplete="tel" inputmode="tel" aria-describedby="ajuda-telefone"><small id="ajuda-telefone">Opcional, se preferir que liguemos.</small></div>
        <div class="campo"><label for="alojamentos">Quantos alojamentos gere?</label><select id="alojamentos" name="alojamentos"><option>1 a 3</option><option>4 a 10</option><option>Mais de 10</option><option>Ainda nenhum</option></select></div>
      </div>
      <div class="campo"><label for="mensagem">Como gere hoje as suas reservas? <span aria-hidden="true">*</span></label><textarea id="mensagem" name="mensagem" required aria-describedby="erro-mensagem"></textarea><p class="erro" id="erro-mensagem" role="alert"></p></div>
      <div class="hp" aria-hidden="true"><label for="website">Não preencher</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <button class="btn btn-primary" type="submit">Pedir demonstração</button>
      <p class="form-estado" role="status" aria-live="polite"></p>
      <p class="plano-nota">Usamos estes dados apenas para responder ao seu pedido. Veja a <a href="/privacidade/">política de privacidade</a>.</p>
    </form>
  </div>
</section>`,
};

/* ── Perguntas frequentes ──────────────────────────────────────────── */
const grupos = [
  ['Sobre a plataforma', [
    ['O que é a Santa Paciência?', 'É uma plataforma de gestão para alojamento local. Junta num só sítio as reservas, o calendário, os preços, os hóspedes, os pagamentos, as despesas, a equipa, as comunicações e os relatórios.'],
    ['Preciso de instalar algum programa?', 'Não. Funciona no navegador. No telemóvel, pode adicioná-la ao ecrã inicial e usá-la como uma aplicação, com notificações.'],
    ['Funciona com vários alojamentos e várias pessoas?', 'Sim. Cada alojamento tem o seu calendário e os seus preços, e cada pessoa da equipa tem o seu acesso, com permissões de acordo com a função. Os limites dependem do <a href="/precos/">pacote</a>.'],
    ['Em que línguas está disponível?', 'A plataforma de gestão está em português de Portugal.'],
  ]],
  ['Reservas e canais', [
    ['Sincroniza automaticamente com o Booking.com e o Airbnb?', 'Não. A Santa Paciência não é um gestor de canais: as reservas dessas plataformas são registadas por si, com o canal de origem identificado, e ficam no mesmo calendário das reservas diretas. As reservas feitas na sua página pública entram automaticamente.'],
    ['Posso receber reservas diretas?', 'Sim. Cada conta tem uma <a href="/funcionalidades/reservas-e-calendario/">página pública de reservas</a>, com disponibilidade e preços atualizados, que pode partilhar ou ligar ao seu site.'],
    ['Como evita reservas sobrepostas?', 'A disponibilidade é verificada no momento em que a reserva é criada, tanto na página pública como na gestão. Datas ocupadas ou bloqueadas não podem ser reservadas.'],
  ]],
  ['Pagamentos e faturação', [
    ['Como funcionam os pagamentos online?', 'Os <a href="/funcionalidades/pagamentos-online/">pagamentos por cartão</a> são processados pela Stripe, na sua própria conta Stripe. O dinheiro vai diretamente para si; a Santa Paciência regista o pagamento na reserva.'],
    ['A Santa Paciência emite faturas aos hóspedes?', 'Não. A plataforma regista os valores e os pagamentos de cada reserva, mas não substitui um programa de faturação certificado. Continue a emitir as faturas no programa que já usa.'],
    ['Posso definir sinal e política de cancelamento?', 'Sim. Define a percentagem do sinal, o prazo para o saldo e as condições de reembolso. As regras aplicam-se às reservas diretas e são aceites pelo hóspede ao reservar.'],
  ]],
  ['Dados e segurança', [
    ['Onde ficam os meus dados?', 'Em servidores geridos por nós, com cópias de segurança. Cada conta tem os seus dados separados das restantes.'],
    ['Posso exportar os meus dados?', 'Sim. Pode exportar uma cópia de segurança da sua conta e as listagens de que precisa, a qualquer momento.'],
    ['Como tratam os dados dos hóspedes?', 'São usados apenas para gerir a estadia. As permissões limitam quem os pode ver e editar, e pode anonimizar a ficha de um hóspede quando ele o pedir. Veja a <a href="/privacidade/">política de privacidade</a>.'],
  ]],
];

const perguntas = {
  path: '/perguntas-frequentes/',
  title: 'Perguntas frequentes | Santa Paciência',
  description: 'Respostas diretas sobre a Santa Paciência: como funciona, reservas e canais, pagamentos online, faturação, dados e segurança.',
  ogHeadline: 'Perguntas frequentes',
  crumbs: [['/perguntas-frequentes/', 'Perguntas frequentes']],
  body: `${pageHero({ eyebrow: 'Perguntas frequentes', h1: 'Respostas <em>diretas</em>', lead: 'O que nos perguntam mais vezes, incluindo o que a plataforma não faz.', actions: false })}
${grupos.map(([titulo, items], i) => `<section class="section${i % 2 ? '' : ' papel'}" style="padding-block:clamp(2.5rem,2rem + 3vw,4.5rem)"><div class="wrap"><h2 class="h3 reveal" style="margin-bottom:1.4rem">${titulo}</h2>${faq(items)}</div></section>`).join('\n')}
${cta('Ficou alguma pergunta por responder?', 'Escreva-nos. Respondemos em um dia útil, sem conversa de vendedor.')}`,
};

/* ── Legais ────────────────────────────────────────────────────────── */
const legal = (path, name, title, description, html) => ({
  path, title: `${title} | Santa Paciência`, description, ogHeadline: name,
  crumbs: [[path, name]],
  body: `${pageHero({ eyebrow: 'Informação legal', h1: name, actions: false })}
<section class="section papel" style="padding-top:3rem"><div class="wrap"><div class="prose">
<p class="nota"><strong>Texto provisório.</strong> Este documento é um modelo de trabalho e tem de ser revisto e completado (identificação da entidade, NIF, morada e contactos) antes da publicação do site.</p>
${html}
<p class="artigo-meta">Última atualização: 16 de novembro de 2026.</p>
</div></div></section>`,
});

const privacidade = legal('/privacidade/', 'Política de privacidade', 'Política de privacidade', 'Como a Santa Paciência trata os dados pessoais de quem visita o site e pede uma demonstração.', `
<h2>Quem é responsável pelos dados</h2>
<p>O responsável pelo tratamento dos dados recolhidos neste site é a entidade que explora a Santa Paciência [identificação, NIF e morada por preencher]. Pode contactar-nos através de <a href="mailto:${cfg.email}">${cfg.email}</a>.</p>
<h2>Que dados recolhemos neste site</h2>
<ul><li><strong>Formulário de contacto:</strong> nome, email, telefone (se o indicar), número de alojamentos e a mensagem que escrever.</li><li><strong>Dados técnicos:</strong> os registos habituais do servidor (endereço IP, data e página pedida), guardados por tempo limitado para segurança e diagnóstico.</li></ul>
<p>Este site não usa cookies de publicidade nem ferramentas de seguimento de terceiros.</p>
<h2>Para que usamos os dados</h2>
<p>Usamos os dados do formulário apenas para responder ao seu pedido e, se assim o quiser, marcar uma demonstração. O fundamento é a sua iniciativa de nos contactar (diligências pré-contratuais a seu pedido).</p>
<h2>Durante quanto tempo</h2>
<p>Guardamos os pedidos de contacto enquanto durar a conversa e, no máximo, 12 meses depois do último contacto, salvo se entretanto se tornar cliente.</p>
<h2>Os seus direitos</h2>
<p>Pode pedir o acesso, a retificação ou o apagamento dos seus dados, bem como opor-se ao tratamento, escrevendo para <a href="mailto:${cfg.email}">${cfg.email}</a>. Tem também o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD).</p>
<h2>Dados tratados dentro da plataforma</h2>
<p>Os dados que os clientes introduzem na plataforma (por exemplo, dados de hóspedes) são tratados pela Santa Paciência por conta do cliente, que é o responsável por esses dados. As condições desse tratamento constam do contrato de prestação de serviços.</p>`);

const termos = legal('/termos/', 'Termos de utilização', 'Termos de utilização', 'Condições de utilização do site da Santa Paciência: conteúdos, preços indicados, propriedade intelectual e lei aplicável.', `
<h2>Âmbito</h2>
<p>Estes termos regulam a utilização deste site. A utilização da plataforma Santa Paciência pelos clientes é regulada por um contrato próprio.</p>
<h2>Conteúdos do site</h2>
<p>Os textos, imagens e ilustrações deste site destinam-se a apresentar a plataforma. As ilustrações de ecrãs usam dados de exemplo. Procuramos manter a informação atualizada, mas as funcionalidades e os preços podem mudar; as condições aplicáveis são as que constarem da proposta que lhe enviarmos.</p>
<h2>Preços</h2>
<p>Os preços indicados não incluem IVA e podem ser alterados. Qualquer alteração de preço para clientes existentes é comunicada com antecedência.</p>
<h2>Propriedade intelectual</h2>
<p>O nome, o logótipo e os conteúdos deste site pertencem à Santa Paciência e não podem ser reproduzidos sem autorização.</p>
<h2>Lei aplicável</h2>
<p>Estes termos regem-se pela lei portuguesa.</p>
<h2>Contacto</h2>
<p>Para qualquer questão sobre estes termos, escreva para <a href="mailto:${cfg.email}">${cfg.email}</a>.</p>`);

const naoEncontrada = {
  path: '/404.html',
  title: 'Página não encontrada | Santa Paciência',
  description: 'A página que procura não existe ou mudou de sítio.',
  noindex: true, noSitemap: true,
  body: `<section class="nf"><div class="wrap">
  ${arch()}
  <p class="eyebrow">Erro 404</p>
  <h1>Esta porta <em>não dá para lado nenhum</em></h1>
  <p class="lead">A página que procura não existe ou mudou de sítio. Santa paciência. Experimente um destes caminhos.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/">Voltar ao início</a><a class="btn btn-ghost" href="/funcionalidades/">Funcionalidades</a><a class="btn btn-ghost" href="/contacto/">Contacto</a></div>
</div></section>`,
};

module.exports = [paraQuem, ...P.map(personaPage), precos, sobre, contacto, perguntas, privacidade, termos, naoEncontrada];
void related;
