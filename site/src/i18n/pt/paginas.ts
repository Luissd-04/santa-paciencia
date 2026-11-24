// Páginas de texto: acesso antecipado, 404, sobre, contacto, perguntas frequentes, índices e páginas legais.
export const acesso = {
  titulo: 'Acesso antecipado',
  descricao: 'Peça acesso antecipado ao software de gestão de alojamento local feito em Portugal. Configuração acompanhada e sem cartão de crédito.',
  kickerTag: 'Vagas limitadas',
  kicker: 'A abrir por ordem de pedido',
  h1: 'Seja dos primeiros.',
  lede: 'Estamos a abrir aos poucos, para acompanhar cada alojamento de perto. Deixe os seus dados e nós tratamos do resto.',
  passos: [
    ['Respondemos por email', 'Para conhecer o seu alojamento e marcar uma conversa rápida.'],
    ['Configuramos consigo', 'Casas, preços e reservas que já tem. Numa tarde fica pronto.'],
    ['Recebe a primeira reserva', 'Pelo seu site, com o sinal pago e o calendário em dia.'],
  ] as [string, string][],
};

export const erro404 = {
  titulo: 'Página não encontrada',
  descricao: 'Esta página não existe ou mudou de endereço. Volte ao início ou veja as funcionalidades e os preços.',
  kickerTag: '404',
  kicker: 'Página não encontrada',
  h1: 'Esta página perdeu-se pelo caminho.',
  lede: 'O endereço pode estar errado ou a página mudou de sítio. Volte ao início e encontra tudo.',
  voltar: 'Voltar ao início',
  precos: 'Ver preços',
};

export const sobre = {
  titulo: 'Sobre nós',
  descricao: 'O software de alojamento local nasceu numa casa de turismo no Alentejo, feito em Portugal por quem conhece a taxa turística e o Livro de Reclamações.',
  caminho: 'Sobre',
  h1: 'Nasceu numa casa de turismo no Alentejo.',
  lede: 'Não foi uma ideia de gabinete. Foi o que faltava a um alojamento a sério.',
  historiaAria: 'A nossa história',
  abre: 'Começou para resolver os problemas de um alojamento real, em Reguengos de Monsaraz. Reservas, pagamentos, hóspedes e limpezas: tudo o que dá trabalho a quem recebe pessoas em casa.',
  p2: 'Cada funcionalidade foi testada lá primeiro, no dia a dia dessa casa, e só ficou quando tornou o trabalho mais simples.',
  p3: 'É feito em Portugal, por quem conhece a taxa turística, o SIBA e o Livro de Reclamações, e sabe que a época alta não perdoa.',
  p4Antes: 'Agora está a abrir a outros alojamentos, aos poucos. Se gere uma casa ou dez e reconhece estes problemas, ',
  p4Acesso: 'peça acesso antecipado',
  p4Meio: ' ou ',
  p4Contacto: 'fale connosco',
  pontos: [
    { icone: 'key', titulo: 'Testado numa casa real', texto: 'Cada funcionalidade foi usada primeiro num alojamento a sério, em Reguengos de Monsaraz.' },
    { icone: 'flag', titulo: 'Feito em Portugal', texto: 'Por quem conhece a taxa turística, o SIBA e o Livro de Reclamações.' },
    { icone: 'guest', titulo: 'A abrir aos poucos', texto: 'Estamos a receber outros alojamentos por ordem de pedido, para acompanhar cada um de perto.' },
  ] as { icone: string; titulo: string; texto: string }[],
  fimTitulo: 'Venha conhecer por dentro.',
  fimTexto: 'Estamos a abrir aos poucos, com acompanhamento pessoal na configuração. Peça já o seu lugar.',
};

export const contacto = {
  titulo: 'Contacto',
  descricao: 'Uma dúvida, uma ideia ou só curiosidade sobre o software de alojamento local? Escreva-nos: respondemos por email.',
  h1: 'Fale connosco.',
  lede: 'Uma dúvida, uma ideia ou só curiosidade. Respondemos por email.',
  preferir: 'Prefere escrever diretamente?',
  formTitulo: 'Enviar mensagem',
  formBotao: 'Enviar mensagem',
  formMensagem: 'A sua mensagem',
  formModo: 'Contacto',
  formNota: 'Usamos os seus dados só para responder a esta mensagem.',
};

export const perguntas = {
  titulo: 'Perguntas frequentes sobre alojamento local',
  descricao: 'Respostas rápidas sobre preços, Airbnb e Booking.com, SIBA, pagamentos, dados e mudança de programa.',
  caminho: 'Perguntas frequentes',
  h1: 'Perguntas que nos fazem sempre.',
  lede: 'Respostas diretas, incluindo o que a plataforma ainda não faz. Se não encontrar a sua, escreva-nos.',
  porTemaAria: 'Perguntas por tema',
  temasAria: 'Temas',
  fimTitulo: 'Ficou alguma por responder?',
  fimTexto: 'Escreva-nos ou peça acesso antecipado. Respondemos por email, sem conversa de vendedor.',
  // Perguntas do início, dos preços e das funcionalidades, por temas. Só afirma o que a plataforma faz.
  temas: [
    { id: 'comecar', titulo: 'Começar', itens: [
      ['Preciso de instalar alguma coisa?', 'Não. Funciona no browser, no computador e no telemóvel. Se quiser, pode adicioná-lo ao ecrã principal do telemóvel como uma app e receber avisos.'],
      ['Posso mudar a meio da época?', 'Pode. Ajudamos a passar as reservas que já tem, para não perder nada pelo caminho.'],
      ['Preciso de ter um site?', 'Não. A página de reservas funciona sozinha e pode partilhá-la nas redes ou por mensagem.'],
      ['Funciona com WordPress?', 'Sim. Basta colar duas linhas de código numa página.'],
    ] },
    { id: 'reservas', titulo: 'Reservas e calendário', itens: [
      ['Funciona com o Airbnb e o Booking.com?', 'As reservas dessas plataformas ficam no mesmo calendário, registadas por si com o canal identificado. A sincronização automática ainda não existe; as reservas feitas no seu site entram sozinhas.'],
      ['Posso bloquear datas para mim?', 'Pode. Os bloqueios aparecem no calendário e essas datas deixam de estar disponíveis na sua página de reservas.'],
    ] },
    { id: 'pagamentos', titulo: 'Pagamentos', itens: [
      ['Como funcionam os pagamentos online?', 'O hóspede recebe um email com o link e paga por cartão, em segurança, com a Stripe. Escolhe se cobra só o sinal ou o valor total, e quando se cobra o resto. A política de cancelamento fica à vista do hóspede antes de pagar, e os reembolsos ficam registados.'],
      ['Há comissões por reserva?', 'Não. Paga só o plano. Nos pagamentos por cartão aplicam-se as taxas da Stripe, como em qualquer loja online.'],
      ['Emite faturas aos hóspedes?', 'Não. Regista os valores e os pagamentos de cada reserva, mas não é um programa de faturação certificado. Continue a emitir as faturas no programa que já usa.'],
      ['Calcula a taxa turística?', 'Calcula-a nas reservas e nos relatórios, por mês e por casa. A entrega à câmara continua a ser feita por si.'],
    ] },
    { id: 'hospedes', titulo: 'Hóspedes e SIBA', itens: [
      ['Comunica os hóspedes ao SIBA?', 'O pré-check-in recolhe todos os dados que o SIBA pede. A comunicação continua a ser feita por si, mas com os dados já organizados.'],
      ['E a privacidade do hóspede?', 'O hóspede vê a informação de privacidade antes de enviar os dados, e a aceitação fica registada.'],
      ['De onde saem os emails automáticos?', 'Do seu Gmail, para os hóspedes lhe responderem a si e a conversa ficar na reserva. Os modelos existem em sete línguas: português, inglês, francês, espanhol, alemão, italiano e neerlandês.'],
    ] },
    { id: 'precos', titulo: 'Preços', itens: [
      ['Quanto custa?', 'Há três planos mensais, consoante o número de casas, e nenhuma comissão por reserva. Pode ver tudo na página de preços.'],
      ['Posso mudar de plano?', 'Sempre que quiser, para cima ou para baixo.'],
      ['Há fidelização?', 'Não. No plano mensal pode cancelar quando quiser.'],
      ['Os preços incluem IVA?', 'Os valores apresentados não incluem IVA à taxa legal em vigor.'],
      ['A equipa paga utilizador?', 'Depende do plano: o Essencial inclui 2 utilizadores, o Profissional 5 e o Premium não tem limite.'],
    ] },
    { id: 'dados', titulo: 'Dados e segurança', itens: [
      ['Os meus dados estão seguros?', 'Sim. O acesso é protegido, cada pessoa da equipa vê só o que precisa e o consentimento dos hóspedes fica registado.'],
      ['Posso exportar os meus dados?', 'Pode, quando quiser. Há cópias de segurança e exportações dos seus dados.'],
      ['A equipa vê os números do negócio?', 'Não precisa. A equipa vê as chegadas e as tarefas, não vê os números, e as permissões definem o que cada pessoa pode ver.'],
      ['Fica registado quem fez o quê?', 'Sim. Cancelamentos, reembolsos e mudanças de permissões ficam registados.'],
    ] },
  ] as { id: string; titulo: string; itens: [string, string][] }[],
};

export const indiceFuncionalidades = {
  titulo: 'Funcionalidades do software de alojamento local',
  descricao: 'Calendário, reservas diretas, pagamentos, pré-check-in, limpezas, emails, despesas e relatórios. Tudo o que um alojamento local precisa, num só sítio.',
  caminho: 'Funcionalidades',
  h1: 'Tudo o que precisa. Nada do que não precisa.',
  lede: 'Oito ferramentas que trabalham juntas. Comece pelas que lhe fazem falta hoje; as outras estão lá quando o negócio crescer.',
  oitoAria: 'As oito funcionalidades',
  saberMais: 'Saber mais',
  aindaH2: 'E ainda',
  ainda: [
    ['Funciona como app no telemóvel.', 'Adicione ao ecrã principal e receba avisos.'],
    ['Cópias de segurança.', 'Exporte os seus dados quando quiser.'],
    ['Registo de quem fez o quê.', 'Cancelamentos, reembolsos e permissões ficam registados.'],
    ['Ajuda dentro da app.', 'Fale connosco sem sair do sítio.'],
  ] as [string, string][],
};

export const indicePara = {
  titulo: 'Para quem é o software de alojamento local',
  descricao: 'Do primeiro alojamento à empresa de gestão: veja como o software se ajusta a proprietários, gestores de várias casas e empresas de gestão.',
  caminho: 'Para quem',
  h1: 'Do primeiro quarto à empresa de gestão.',
  lede: 'A mesma plataforma, três maneiras de a usar. Escolha a que se parece mais com o seu dia.',
  perfisAria: 'Perfis',
  verComoAjuda: 'Ver como ajuda',
  perfis: [
    ['1–3 casas', 'Proprietários', 'Gere as casas nas horas vagas e quer deixar de viver agarrado ao telemóvel.', 'proprietarios'],
    ['4–20 casas', 'Gestores de várias casas', 'Precisa de ver tudo de uma vez: quem chega, quem pagou, o que falta limpar.', 'gestores'],
    ['Mais de 20', 'Empresas de gestão', 'Equipas, permissões por função e relatórios para enviar a cada proprietário.', 'empresas-de-gestao'],
  ] as [string, string, string, string][],
};

export const indiceGuias = {
  titulo: 'Guias de gestão de alojamento local',
  descricao: 'Guias práticos para quem tem alojamento local: organizar as reservas, definir sinal e cancelamento e preparar a chegada dos hóspedes.',
  caminho: 'Guias',
  h1: 'Guias para quem tem alojamento local.',
  lede: 'Conselhos práticos, sem rodeios, para receber melhor e trabalhar menos.',
  guiasAria: 'Guias',
  leitura: 'min de leitura',
  ler: 'Ler o guia',
};

export const guia = {
  kicker: 'Guia',
  publicado: 'Publicado a',
  leitura: 'Leitura de {min} min',
  fimPergunta: 'Quer ver isto a funcionar na sua casa?',
  fimTexto: 'Estamos a abrir aos poucos, com acompanhamento pessoal na configuração.',
  pedir: 'Pedir acesso antecipado',
  continuar: 'Para continuar.',
  guiaPrefixo: 'Guia: ',
};

export const privacidade = {
  titulo: 'Política de privacidade',
  descricao: 'Como a {marca} trata os dados pessoais de quem visita o site e pede acesso antecipado ou nos contacta.',
  h1: 'Política de privacidade',
  atualizado: '24 de novembro de 2026',
  // Blocos: título e corpo em HTML simples. {marca} e {email} (ligação mailto) são substituídos na página.
  blocos: [
    { h: 'Quem é responsável pelos dados', html: '<p>O responsável pelo tratamento dos dados recolhidos neste site é a entidade que explora a {marca} [identificação, NIF e morada por preencher]. Pode contactar-nos através de {email}.</p>' },
    { h: 'Que dados recolhemos neste site', html: '<ul><li><strong>Formulários de acesso antecipado e de contacto:</strong> nome, email, telefone (se o indicar), número de alojamentos, canais onde anuncia, o assunto e a mensagem que escrever.</li><li><strong>Dados técnicos:</strong> os registos habituais do servidor (endereço IP, data e página pedida), guardados por tempo limitado para segurança e diagnóstico.</li></ul><p>Este site não usa cookies de publicidade nem ferramentas de seguimento de terceiros.</p>' },
    { h: 'Para que usamos os dados', html: '<p>Usamos os dados dos formulários apenas para responder ao seu pedido e, se assim o quiser, combinar a configuração do acesso. O fundamento é a sua iniciativa de nos contactar (diligências pré-contratuais a seu pedido).</p>' },
    { h: 'Durante quanto tempo', html: '<p>Guardamos os pedidos de contacto enquanto durar a conversa e, no máximo, 12 meses depois do último contacto, salvo se entretanto se tornar cliente.</p>' },
    { h: 'Os seus direitos', html: '<p>Pode pedir o acesso, a retificação ou o apagamento dos seus dados, bem como opor-se ao tratamento, escrevendo para {email}. Tem também o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD).</p>' },
    { h: 'Dados tratados dentro da plataforma', html: '<p>Os dados que os clientes introduzem na plataforma (por exemplo, dados de hóspedes) são tratados pela {marca} por conta do cliente, que é o responsável por esses dados. As condições desse tratamento constam do contrato de prestação de serviços.</p>' },
  ],
};

export const termos = {
  titulo: 'Termos de utilização',
  descricao: 'Condições de utilização do site da {marca}: conteúdos, preços indicados, propriedade intelectual e lei aplicável.',
  h1: 'Termos de utilização',
  atualizado: '24 de novembro de 2026',
  blocos: [
    { h: 'Âmbito', html: '<p>Estes termos regulam a utilização deste site. A utilização da plataforma {marca} pelos clientes é regulada por um contrato próprio.</p>' },
    { h: 'Conteúdos do site', html: '<p>Os textos, imagens e ilustrações deste site destinam-se a apresentar a plataforma. As ilustrações de ecrãs usam dados de exemplo. Procuramos manter a informação atualizada, mas as funcionalidades e os preços podem mudar; as condições aplicáveis são as que constarem da proposta que lhe enviarmos.</p>' },
    { h: 'Preços', html: '<p>Os preços indicados não incluem IVA e podem ser alterados. Qualquer alteração de preço para clientes existentes é comunicada com antecedência.</p>' },
    { h: 'Propriedade intelectual', html: '<p>O nome, o logótipo e os conteúdos deste site pertencem à {marca} e não podem ser reproduzidos sem autorização.</p>' },
    { h: 'Lei aplicável', html: '<p>Estes termos regem-se pela lei portuguesa.</p>' },
    { h: 'Contacto', html: '<p>Para qualquer questão sobre estes termos, escreva para {email}.</p>' },
  ],
};
