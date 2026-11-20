const { icon, arch, cta, faq, cfg } = require('../layout.cjs');

const tiles = [
  ['/funcionalidades/reservas-e-calendario/', 'calendar', 'Reservas e calendário', 'Todas as reservas, de todos os canais, num calendário por alojamento. Vê-se num relance o que entra, o que sai e o que está livre.', true],
  ['/funcionalidades/precos-por-epoca/', 'tag', 'Preços por época', 'Períodos com preço por noite, dias da semana e estadia mínima. O total da reserva calcula-se sozinho.'],
  ['/funcionalidades/hospedes-e-pre-check-in/', 'users', 'Hóspedes e pré-check-in', 'Fichas com histórico de estadias e um pré-check-in que o hóspede preenche no telemóvel antes de chegar.'],
  ['/funcionalidades/pagamentos-online/', 'card', 'Pagamentos online', 'Sinal e saldo pagos por cartão com Stripe, com a sua política de cancelamento aplicada à reserva.'],
  ['/funcionalidades/despesas-e-fornecedores/', 'receipt', 'Despesas e fornecedores', 'Fotografe o talão e a despesa fica registada por alojamento, categoria e fornecedor.'],
  ['/funcionalidades/equipa-e-tarefas/', 'team', 'Equipa e tarefas', 'Limpezas, manutenção e check-ins atribuídos a quem os faz, com permissões por função.'],
  ['/funcionalidades/comunicacoes-e-vouchers/', 'mail', 'Comunicações e vouchers', 'Emails de confirmação, chegada e saída enviados na hora certa. Vouchers de desconto com regras claras.'],
  ['/funcionalidades/relatorios/', 'chart', 'Relatórios', 'Receita, ocupação, despesas e margem por mês, por alojamento e por canal. Sem fórmulas para manter.'],
];

const marquee = ['Reservas', 'Calendário', 'Preços por época', 'Pré-check-in', 'Pagamentos online', 'Despesas', 'Fornecedores', 'Equipa', 'Tarefas', 'Emails automáticos', 'Vouchers', 'Relatórios'];
const marqueeHtml = (hidden) => marquee.map((m) => `<span${hidden ? ' aria-hidden="true"' : ''}>${m}</span>`).join('');

const faqs = [
  ['Para que tipo de alojamento serve?', 'Para alojamento local em Portugal: apartamentos, moradias, quartos e pequenas unidades com várias tipologias. Funciona tão bem com uma casa como com dezenas, geridas por uma pessoa ou por uma equipa.'],
  ['Preciso de instalar alguma coisa?', 'Não. A Santa Paciência funciona no navegador do computador, do tablet e do telemóvel. No telemóvel pode ser adicionada ao ecrã inicial e comporta-se como uma aplicação, com notificações.'],
  ['Substitui o Booking.com ou o Airbnb?', 'Não. Continua a vender onde já vende. A Santa Paciência é o sítio onde junta e gere todas as reservas, incluindo as diretas, que pode receber através da sua própria página de reservas.'],
  ['Os meus dados ficam seguros?', 'Cada conta tem os seus dados separados, com permissões por função, registo das ações sensíveis e cópias de segurança que pode exportar quando quiser. Os pagamentos por cartão são processados pela Stripe; não guardamos dados de cartões.'],
  ['Quanto custa?', `Há três pacotes, a partir de ${cfg.plans[0].price} € por mês, conforme o número de alojamentos e de utilizadores. <a href="/precos/">Veja os preços e o que cada pacote inclui</a>.`],
];

const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <p class="eyebrow">Software de gestão de alojamento local</p>
      <h1><span class="l" style="--i:0">Gerir alojamento</span><span class="l" style="--i:1">local pede</span><span class="l" style="--i:2"><em>santa paciência.</em></span></h1>
      <p class="lead">Nós ficamos com a parte da paciência. Reservas, calendário, preços, hóspedes, pagamentos, despesas e equipa num só sítio, feito em Portugal para quem recebe pessoas.</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="/contacto/">Pedir demonstração ${icon('arrow')}</a>
        <a class="btn btn-ghost" href="/funcionalidades/">Ver funcionalidades</a>
      </div>
      <ul class="hero-note">
        <li>${icon('check')} Sem instalação</li>
        <li>${icon('check')} Computador e telemóvel</li>
        <li>${icon('check')} Em português</li>
      </ul>
    </div>

    <div class="demo" role="img" aria-label="Ilustração do calendário de reservas da Santa Paciência com três alojamentos, um resumo das chegadas de hoje e um aviso de pagamento recebido. Dados de exemplo.">
      <div class="demo-win">
        <div class="mock-bar"><i></i><i></i><i></i><span>Calendário · junho</span></div>
        <div class="cal">
          <div class="cal-h"></div>
          <div class="cal-h">seg<b>9</b></div><div class="cal-h">ter<b>10</b></div><div class="cal-h hoje">qua<b>11</b></div><div class="cal-h">qui<b>12</b></div><div class="cal-h">sex<b>13</b></div><div class="cal-h">sáb<b>14</b></div><div class="cal-h">dom<b>15</b></div>
          <div class="cal-u">Casa da Eira</div>
          <div class="cal-row"><span class="bar" style="grid-column:1/6;--i:0">Marta S. · 2 hósp.</span><span class="bar b2" style="grid-column:8/15;--i:1">Família Lopes</span></div>
          <div class="cal-u">Quarto Azul</div>
          <div class="cal-row"><span class="bar b3" style="grid-column:2/8;--i:2">J. Almeida</span><span class="bar nova" style="grid-column:10/14">Nova reserva</span></div>
          <div class="cal-u">Loft do Rio</div>
          <div class="cal-row"><span class="bar b4" style="grid-column:4/11;--i:3">Ana e Pedro</span></div>
          <div class="cal-u">Casa do Forno</div>
          <div class="cal-row"><span class="bar b2" style="grid-column:1/4;--i:4">R. Costa</span><span class="bar" style="grid-column:6/13;--i:5">Sofia M. · 4 hósp.</span></div>
        </div>
      </div>
      <div class="demo-card demo-chegadas"><small>Chegadas hoje</small><strong>3</strong>2 com pré-check-in feito</div>
      <div class="demo-card demo-toast"><span class="dot">${icon('check')}</span><div><b>Sinal recebido</b><span>Quarto Azul · 54,00 €</span></div></div>
    </div>
  </div>
</section>

<div class="marquee" aria-label="O que a plataforma inclui">
  <div class="marquee-track">${marqueeHtml(false)}${marqueeHtml(true)}</div>
</div>

<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">O problema</p>
      <h2>A folha de cálculo aguentou até à terceira casa. <em>Depois deixou de aguentar.</em></h2>
    </div>
    <div class="contraste">
      <div class="antes reveal">
        <h3>Como costuma ser</h3>
        <ul>
          <li>Reservas espalhadas por emails, extranets e mensagens</li>
          <li>Uma folha de cálculo que só uma pessoa sabe atualizar</li>
          <li>Transferências por confirmar e sinais por cobrar</li>
          <li>Limpezas combinadas por WhatsApp, à última hora</li>
          <li>Talões numa caixa de sapatos até ao fim do trimestre</li>
        </ul>
      </div>
      <div class="depois reveal">
        <h3>Com a Santa Paciência</h3>
        <ul>
          <li>${icon('check')} Um calendário único, por alojamento, sempre atualizado</li>
          <li>${icon('check')} Cada reserva com hóspede, valores, pagamentos e histórico</li>
          <li>${icon('check')} Sinal e saldo pagos online, registados sem intervenção</li>
          <li>${icon('check')} Tarefas atribuídas à equipa, com aviso no telemóvel</li>
          <li>${icon('check')} Despesas lançadas a partir da fotografia do talão</li>
          <li>${icon('check')} Relatórios de receita, ocupação e margem sempre prontos</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section papel" id="funcionalidades">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Funcionalidades</p>
      <h2>Tudo o que a operação pede, <em>no mesmo sítio</em></h2>
      <p>Oito áreas que falam umas com as outras: a reserva sabe do pagamento, o calendário sabe da limpeza, o relatório sabe da despesa.</p>
    </div>
    <div class="bento">
      ${tiles.map(([href, ico, title, text, dark]) => `<a class="tile reveal${dark ? ' tile-dark' : ''}" href="${href}">${icon(ico)}<h3>${title}</h3><p>${text}</p><span class="link-arrow">Saber mais ${icon('arrow')}</span></a>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Do pedido à saída</p>
      <h2>Uma reserva direta, <em>sem telefonemas</em></h2>
      <p>O percurso de uma reserva feita na sua página, do primeiro clique ao dia da partida.</p>
    </div>
    <ol class="percurso">
      <li class="reveal"><h3>Pedido</h3><p>O hóspede escolhe datas e alojamento na sua página de reservas e vê o preço certo para a época.</p></li>
      <li class="reveal"><h3>Sinal</h3><p>Paga o sinal por cartão. A reserva fica confirmada e o calendário bloqueia as datas.</p></li>
      <li class="reveal"><h3>Pré-check-in</h3><p>Antes de chegar, indica quem vem e a hora prevista, a partir do telemóvel.</p></li>
      <li class="reveal"><h3>Chegada</h3><p>A equipa sabe quem chega e a que horas. O hóspede recebe as instruções por email.</p></li>
      <li class="reveal"><h3>Saída</h3><p>A limpeza já está marcada, o saldo está liquidado e os números entram no relatório.</p></li>
    </ol>
  </div>
</section>

<section class="section areia">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Ligações</p>
      <h2>Trabalha com as ferramentas <em>que já usa</em></h2>
    </div>
    <ul class="integra">
      <li class="reveal"><strong>Google Calendar</strong><span>As reservas aparecem no calendário da equipa, atualizadas quando mudam.</span></li>
      <li class="reveal"><strong>Gmail</strong><span>Os emails aos hóspedes saem da sua própria conta, com as respostas no mesmo sítio.</span></li>
      <li class="reveal"><strong>Google Tasks</strong><span>As tarefas operacionais chegam à lista de quem as tem de fazer.</span></li>
      <li class="reveal"><strong>Stripe</strong><span>Pagamentos por cartão, com sinal, saldo e reembolsos registados na reserva.</span></li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Para quem</p>
      <h2>Do primeiro alojamento <em>à empresa de gestão</em></h2>
    </div>
    <div class="perfis">
      <a class="perfil reveal" href="/para-quem/proprietarios/">${icon('home')}<h3>Proprietários</h3><p>Uma ou duas casas, geridas nas horas vagas. Menos tempo ao telefone, nada esquecido.</p><span class="link-arrow">Para proprietários ${icon('arrow')}</span></a>
      <a class="perfil reveal" href="/para-quem/gestores-de-varias-unidades/">${icon('building')}<h3>Gestores de várias unidades</h3><p>Vários alojamentos, um só calendário. Preços, limpezas e pagamentos sob controlo.</p><span class="link-arrow">Para gestores ${icon('arrow')}</span></a>
      <a class="perfil reveal" href="/para-quem/empresas-de-gestao/">${icon('briefcase')}<h3>Empresas de gestão</h3><p>Equipa, departamentos e permissões. Cada pessoa vê o que precisa de ver.</p><span class="link-arrow">Para empresas ${icon('arrow')}</span></a>
    </div>
  </div>
</section>

<section class="section papel">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Perguntas frequentes</p>
      <h2>Antes de <em>perguntar</em></h2>
    </div>
    ${faq(faqs)}
    <p class="precos-nota"><a class="link-arrow" href="/perguntas-frequentes/">Ver todas as perguntas ${icon('arrow')}</a></p>
  </div>
</section>
${cta()}`;

module.exports = [{
  path: '/',
  title: 'Santa Paciência — Software de gestão de alojamento local',
  description: 'Reservas, calendário, preços, hóspedes, pagamentos online, despesas e equipa num só sítio. Software de gestão de alojamento local feito em Portugal.',
  ogHeadline: 'Gerir alojamento local pede santa paciência.',
  software: true,
  body,
}];
