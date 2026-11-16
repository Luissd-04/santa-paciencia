const { icon, cta, pageHero, related, brandTitle } = require('../layout.cjs');

const G = [
  {
    slug: 'organizar-reservas-sem-folhas-de-calculo',
    name: 'Como organizar as reservas sem folhas de cálculo',
    title: 'Como organizar as reservas de alojamento local sem folhas de cálculo',
    seoTitle: 'Organizar reservas de alojamento local sem folhas de cálculo',
    description: 'A folha de cálculo funciona até deixar de funcionar. Veja os sinais de que chegou a altura de mudar e como organizar as reservas passo a passo.',
    tema: 'Organização', leitura: '5 min',
    resumo: 'Os sinais de que a folha de cálculo já não chega e um método em cinco passos para organizar as reservas.',
    html: `
<p>Quase toda a gente começa da mesma maneira: uma folha de cálculo com uma linha por reserva. É simples, é grátis e, com um alojamento, chega perfeitamente. O problema aparece devagar, e normalmente dá-se por ele no pior dia possível.</p>
<h2>Cinco sinais de que a folha de cálculo já não chega</h2>
<ul>
<li><strong>Só uma pessoa a sabe usar.</strong> Se essa pessoa adoecer, ninguém sabe quem chega amanhã.</li>
<li><strong>Já teve, ou esteve quase a ter, uma reserva sobreposta.</strong> A folha não avisa quando duas reservas ocupam as mesmas noites.</li>
<li><strong>Não sabe de cor quem ainda não pagou.</strong> Os sinais e os saldos estão numa coluna que ninguém confere todos os dias.</li>
<li><strong>A informação vive em três sítios.</strong> O email tem as datas, as mensagens têm a hora de chegada, a folha tem o valor.</li>
<li><strong>No fim do ano, fazer contas demora um fim de semana.</strong> Receita por casa, ocupação, despesas: tudo tem de ser somado à mão.</li>
</ul>
<h2>Um método em cinco passos</h2>
<h3>1. Um calendário por alojamento, e só um</h3>
<p>A regra mais importante: existe um único sítio onde se vê o que está ocupado. Todas as reservas entram lá no momento em que são aceites, venham de onde vierem. Se usa plataformas como o Booking.com ou o Airbnb, registe a reserva no seu calendário assim que recebe o aviso.</p>
<h3>2. Uma ficha por reserva</h3>
<p>Cada reserva deve responder, sem procurar noutro lado, a cinco perguntas: quem vem, quando, para onde, quanto custa e quanto já pagou. Acrescente o canal de origem. Mais tarde vai querer saber de onde vêm as suas reservas.</p>
<h3>3. Estados claros</h3>
<p>«Pedido», «confirmada», «em curso», «concluída», «cancelada». Parece burocracia, mas é o que permite responder em dois segundos a «esta reserva está garantida?». Uma reserva só passa a confirmada quando cumpre a sua regra, por exemplo, sinal recebido.</p>
<h3>4. Pagamentos registados na reserva</h3>
<p>Cada valor recebido fica na reserva, com data e forma de pagamento. Assim, a lista de «quem deve o quê» faz-se sozinha, e não depende da memória de ninguém.</p>
<h3>5. Tarefas ligadas às datas</h3>
<p>Cada saída gera uma limpeza; cada chegada, alguém que recebe. Se as tarefas estiverem ligadas às reservas, mudar uma data muda o trabalho da equipa, sem telefonemas.</p>
<h2>Quando faz sentido passar para um programa</h2>
<p>Com um alojamento e poucas reservas, uma folha bem feita com estes cinco princípios pode bastar. A partir de dois ou três alojamentos, ou quando há mais de uma pessoa envolvida, o tempo gasto a manter a folha começa a custar mais do que um programa próprio. É para esse momento que existe a <a href="/funcionalidades/reservas-e-calendario/">gestão de reservas e calendário da Santa Paciência</a>.</p>`,
    rel: [['/funcionalidades/reservas-e-calendario/', 'Reservas e calendário', 'O calendário único por alojamento.'], ['/para-quem/proprietarios/', 'Para proprietários', 'Gerir a casa nas horas vagas.']],
  },
  {
    slug: 'politica-de-pagamentos-reservas-diretas',
    name: 'Sinal, saldo e cancelamento nas reservas diretas',
    title: 'Sinal, saldo e cancelamento: política de pagamentos para reservas diretas',
    seoTitle: 'Sinal, saldo e cancelamento nas reservas diretas',
    description: 'Quanto pedir de sinal, quando cobrar o resto e o que devolver se o hóspede cancelar. Um guia prático para definir a política de pagamentos do seu alojamento.',
    tema: 'Pagamentos', leitura: '6 min',
    resumo: 'Quanto pedir de sinal, quando cobrar o saldo e como escrever uma política de cancelamento que evita discussões.',
    html: `
<p>Nas plataformas, as regras de pagamento vêm feitas. Nas reservas diretas, é consigo. Uma política clara protege-o de cancelamentos em cima da hora e dá confiança ao hóspede, que sabe exatamente com o que conta. Uma política vaga dá discussões.</p>
<h2>As três decisões que tem de tomar</h2>
<h3>1. Quanto pede de sinal</h3>
<p>O sinal existe para comprometer as duas partes. O habitual no alojamento local é pedir entre 20% e 50% do valor da estadia. Um sinal baixo facilita a decisão do hóspede, mas protege-o pouco; um sinal alto protege-o mais, mas pode afastar reservas feitas com muita antecedência. Para estadias curtas e próximas, há quem peça o valor total.</p>
<h3>2. Quando se paga o resto</h3>
<p>Há duas opções comuns: o saldo é pago alguns dias antes da chegada, ou à chegada. Cobrar antes evita lidar com dinheiro no check-in e dá-lhe tempo para reagir se o pagamento falhar. Seja qual for a escolha, defina uma data concreta («até 7 dias antes da chegada») e não uma intenção («antes da chegada»).</p>
<h3>3. O que devolve se o hóspede cancelar</h3>
<p>É aqui que a maioria das políticas falha, por serem ambíguas. Uma boa regra de cancelamento tem escalões com datas:</p>
<ul>
<li>Cancelamento até 30 dias antes da chegada: devolução total.</li>
<li>Entre 30 e 7 dias antes: o sinal não é devolvido.</li>
<li>Com menos de 7 dias: não há devolução.</li>
</ul>
<p>Os prazos e as percentagens são seus; o que importa é que qualquer pessoa, ao ler, chegue ao mesmo valor.</p>
<h2>Como comunicar a política</h2>
<ul>
<li><strong>Antes de o hóspede pagar.</strong> As condições devem estar visíveis no momento da reserva e ser aceites de forma expressa.</li>
<li><strong>Por escrito, na confirmação.</strong> Repita as datas e os valores no email de confirmação: quanto foi pago, quanto falta e até quando.</li>
<li><strong>Sem exceções improvisadas.</strong> Se decidir abrir uma exceção, registe-a na reserva. Daqui a seis meses ninguém se vai lembrar do que foi combinado ao telefone.</li>
</ul>
<h2>Erros frequentes</h2>
<ul>
<li>Confirmar a reserva sem ter recebido o sinal.</li>
<li>Não guardar prova de que o hóspede aceitou as condições.</li>
<li>Calcular reembolsos de cabeça, com valores diferentes para casos iguais.</li>
<li>Esquecer-se de cobrar o saldo e descobrir no dia da chegada.</li>
</ul>
<p class="nota">Este guia é informação geral e não substitui aconselhamento jurídico. As regras aplicáveis a contratos com consumidores podem condicionar a sua política; em caso de dúvida, confirme com um jurista.</p>
<h2>Automatizar o que se repete</h2>
<p>Depois de definida, a política deve aplicar-se sempre da mesma maneira. Com os <a href="/funcionalidades/pagamentos-online/">pagamentos online da Santa Paciência</a>, o sinal é pago por cartão no momento da reserva, o saldo tem prazo e o valor a devolver num cancelamento é calculado a partir das regras que definiu.</p>`,
    rel: [['/funcionalidades/pagamentos-online/', 'Pagamentos online', 'Sinal e saldo por cartão, com a sua política.'], ['/funcionalidades/comunicacoes-e-vouchers/', 'Comunicações', 'A confirmação certa, enviada na hora.']],
  },
  {
    slug: 'pre-check-in-o-que-pedir-ao-hospede',
    name: 'Pré-check-in: o que pedir ao hóspede antes da chegada',
    title: 'Pré-check-in no alojamento local: o que pedir ao hóspede antes da chegada',
    seoTitle: 'Pré-check-in no alojamento local: o que pedir ao hóspede',
    description: 'O que perguntar ao hóspede antes de ele chegar, quando enviar o pedido e como evitar esperas à porta. Um guia prático de pré-check-in.',
    tema: 'Hóspedes', leitura: '4 min',
    resumo: 'Que informação pedir, quando a pedir e como transformar a chegada num momento simples.',
    html: `
<p>A chegada é o momento em que o hóspede forma a primeira impressão, e também aquele em que mais coisas podem correr mal: o voo atrasa, ninguém atende, faltam dados. O pré-check-in tira esse trabalho do dia da chegada e passa-o para os dias anteriores, quando há tempo.</p>
<h2>O que vale a pena pedir</h2>
<ul>
<li><strong>Quem vem.</strong> O nome do titular e de quem o acompanha. Fica a saber quantas pessoas vai receber e evita surpresas com a lotação.</li>
<li><strong>A hora prevista de chegada.</strong> É a informação mais útil para a operação: permite organizar a limpeza e quem faz a receção.</li>
<li><strong>Os dados de identificação que a lei exigir.</strong> Em Portugal, quem explora alojamento tem obrigações de comunicação relativas a hóspedes estrangeiros. Recolher esses dados com antecedência poupa tempo à porta. Confirme junto das entidades oficiais que dados tem de recolher no seu caso.</li>
<li><strong>Pedidos especiais.</strong> Berço, chegada tardia, alergias. Mais vale saber três dias antes.</li>
</ul>
<h2>O que não vale a pena pedir</h2>
<p>Tudo o que não vai usar. Cada campo a mais reduz o número de hóspedes que preenche o formulário, e cada dado pessoal que guarda é uma responsabilidade sua. Peça o mínimo necessário e explique para que serve.</p>
<h2>Quando enviar</h2>
<p>Cedo de mais, o hóspede ainda não sabe a que horas chega. Tarde de mais, já está em viagem. Um bom momento é entre uma semana e três dias antes da chegada, com um lembrete na véspera para quem ainda não respondeu.</p>
<h2>Como facilitar a vida ao hóspede</h2>
<ul>
<li><strong>Uma ligação, sem contas nem instalações.</strong> O formulário deve abrir no telemóvel e demorar dois minutos.</li>
<li><strong>Poucos passos.</strong> Primeiro quem vem, depois a hora de chegada. Nada mais.</li>
<li><strong>Informação de privacidade à vista.</strong> Diga que dados recolhe, porquê e durante quanto tempo.</li>
<li><strong>Algo em troca.</strong> Depois do pré-check-in, envie as instruções de chegada. O hóspede percebe que preencher lhe serviu de alguma coisa.</li>
</ul>
<h2>O que ganha a equipa</h2>
<p>Com as horas de chegada conhecidas, as limpezas ordenam-se por prioridade, quem faz a receção não fica à espera e as chegadas fora de horas preparam-se com antecedência. Na Santa Paciência, o <a href="/funcionalidades/hospedes-e-pre-check-in/">pré-check-in online</a> fica ligado à reserva, e a equipa vê logo quem já respondeu e quem falta.</p>`,
    rel: [['/funcionalidades/hospedes-e-pre-check-in/', 'Hóspedes e pré-check-in', 'O pré-check-in ligado à reserva.'], ['/funcionalidades/equipa-e-tarefas/', 'Equipa e tarefas', 'Limpezas e receção organizadas pelas chegadas.']],
  },
];

const PUBLISHED = '2026-11-16';

const guidePage = (g) => ({
  path: `/guias/${g.slug}/`,
  title: brandTitle(g.seoTitle || g.title),
  description: g.description,
  h1: g.title,
  ogHeadline: g.name,
  article: { published: PUBLISHED },
  crumbs: [['/guias/', 'Guias'], [`/guias/${g.slug}/`, g.name]],
  body: `<article>
<section class="page-hero"><div class="wrap">
  <p class="eyebrow">Guia · ${g.tema}</p>
  <h1 style="max-width:24ch">${g.title}</h1>
  <p class="artigo-meta">Publicado a <time datetime="${PUBLISHED}">16 de novembro de 2026</time> · Leitura de ${g.leitura}</p>
</div></section>
<section class="section papel" style="padding-top:3rem"><div class="wrap"><div class="prose">${g.html}</div></div></section>
</article>
${related('Relacionado', [...g.rel, ...G.filter((o) => o !== g).slice(0, 1).map((o) => [`/guias/${o.slug}/`, `Guia: ${o.name}`, o.resumo])])}
${cta()}`,
});

const index = {
  path: '/guias/',
  title: 'Guias de gestão de alojamento local | Santa Paciência',
  description: 'Guias práticos para quem gere alojamento local: organizar reservas, definir a política de pagamentos e preparar a chegada dos hóspedes.',
  ogHeadline: 'Guias práticos para o alojamento local',
  crumbs: [['/guias/', 'Guias']],
  body: `${pageHero({ eyebrow: 'Guias', h1: 'Aprender com <em>quem faz</em>', lead: 'Guias práticos, escritos a partir da operação diária. Servem com ou sem a Santa Paciência.', actions: false })}
<section class="section papel" style="padding-top:3.5rem"><div class="wrap">
  <div class="guias">
    ${G.map((g) => `<a class="guia reveal" href="/guias/${g.slug}/"><small>${g.tema} · ${g.leitura}</small><h2 class="h3">${g.name}</h2><p>${g.resumo}</p><span class="link-arrow">Ler o guia ${icon('arrow')}</span></a>`).join('\n    ')}
  </div>
</div></section>
${cta()}`,
};

module.exports = [index, ...G.map(guidePage)];
