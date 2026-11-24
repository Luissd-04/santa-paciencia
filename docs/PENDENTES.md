# Pendentes — melhorias e bugs

Lista viva. Cada ponto sai daqui quando estiver feito e verificado; o histórico fica no Git.
Os planos anteriores continuam em `ROADMAP.md`, `MELHORIAS.md`, `ESCOPO-V1-V2.md` e
`PLANO-CONSOLA.md`; esta lista será a base do documento único.

A revisão de 23–24/11 (23 pontos: portal do hóspede, área do proprietário, conta pessoal,
documentos, vistas predefinidas, recortes e fotografias nítidas, reservas no site do cliente,
filtros, barra lateral, entre outros) está concluída — ver `git log 9a033e7..5d72f4f`.

## A fazer

Da auditoria de 25/11 (`AUDITORIA-PERCURSO-2026-11-25.md`; os números são os do relatório):

1. **Coerência da equipa:** totais e rótulos iguais no painel, na ficha, no calendário e no portal (14); «aguarda pagamento» e pré-aviso de expiração no sino (16).
2. **Taxa turística:** idade de isenção configurável por alojamento.
3. Melhorias da lista do relatório.

## Antes de publicar a revisão de 23–24/11

- Publicar primeiro em testes: há migrações novas (área do proprietário, vistas, recortes, portal, reservas no site).
- Substituir as capas com menos de 1600 px (o aviso «Fotografia pequena» mostra quais).
- Santa Paciência: plano Premium; em «No teu site» autorizar `santapaciencia.pt` e `www.santapaciencia.pt`; ligar «Começar logo nas datas».
- Testar em telemóvel real (iPhone/Safari): reserva no site da cliente, barra do total, deslizar no calendário, portal do hóspede.
- Testar com serviços reais: pesquisa da morada, email «A sua reserva», PDFs no telemóvel.

## Antes de publicar o site de apresentação (`site/`, Astro)

- Nome e domínio definitivos (`site/src/config/brand.ts`); só então `INDEXAR=true` e submeter o sitemap.
- Preços: 19/49/99 € e anual 15/39/79 € são provisórios; o plano de SEO dizia para não publicar preços nesta fase.
- `CONTACT_ENDPOINT` para os pedidos de acesso antecipado entrarem na consola (sem ele, abre o email do visitante).
- Privacidade e termos: textos provisórios, falta revisão jurídica.
- Ler os textos escritos pelos agentes: «Sobre», respostas das perguntas novas, guias em inglês.
- Revisão final: acessibilidade, Lighthouse e revisão das animações.

## Sugestões (por decidir)

- **Sincronizar calendários com o Airbnb e o Booking.com (iCal):** os endereços já se guardam no alojamento, mas nada os importa nem exporta. É das primeiras perguntas de quem experimenta, e o site diz honestamente que ainda não existe.

- Canal «Site do cliente» separado de «Site», para medir quantas reservas a integração traz.
- Auditoria de acessibilidade (WCAG AA) das páginas novas: portal, área do proprietário, página incorporada.
- Atualizar `PERCURSO-HOSPEDE` e `ARQUITETURA` com o portal novo, a área do proprietário, a página incorporada, os recortes e as vistas.

## Para rever (decisões do dono do produto)

**Auditoria de 25/11**
- Subir o preço de uma reserva paga desliga a cobrança automática do restante com o cartão guardado: o hóspede paga pelo link do email «Reserva alterada».
- Sem política, um pagamento parcial registado à mão não confirma a reserva (só o total confirma).
- «Cancelada» saiu do seletor de estado quando há política: cancela-se pelo botão «Cancelar reserva» da ficha.


**Portal do hóspede**
- Mapa a sério? Hoje: morada + «Abrir no Google Maps» (implica guardar coordenadas ao pesquisar a morada).
- Campo «Regras da casa» no alojamento, para o portal.
- Email «A sua reserva» fica retido quando faltam dados do alojamento (como os outros). Manter ou enviar sempre?
- Cor do portal = cor do alojamento principal (ou da organização; terracota se não tiver contraste).
- «Próximo passo: pedir o pré-check-in» passou a enviar o email do portal.
- Staff não envia nem gera o link do portal.
- WhatsApp só para telemóveis PT (9…) ou números com indicativo (+…).

**Documentos**
- «Ficha de hóspede» abre uma janela (PDF, Excel, «Abrir ficha») em vez de ir logo para a ficha.
- «aguardar_pagamento» aparece como «Aguarda sinal» (rótulo da app).

**Vistas predefinidas**
- Telemóvel: Eventos só Semana, Calendário só Mês. Pôr Lista/Mês a funcionar no telemóvel?
- Hóspedes continua a abrir em Cartões por omissão.

**Área do proprietário**
- Nome do papel mais baixo: «Funcionário» (como na app) ou «Equipa» (como na maqueta)?
- Prazo de conservação dos dados depois de encerrar a conta.
- Email de transferência de propriedade só sai com o Gmail ligado (senão, só o aviso no sino).

**Outros**
- Quadrado do logótipo começa centrado (num logótipo largo, as letras do meio).
- Imagem de partilha de links com 1024 px (recomendado 1200 px).
- Número de reservas ao lado de cada opção dos filtros.
- Aspeto clássico antigo (sem `data-look`) não visto nas notificações e na tabela de serviços.

## Forma de trabalhar (pedida pelo utilizador)

- Trabalhar diretamente na **main**: commit e push para `origin main`, um commit por ponto, com mensagem em PT-PT e as linhas de atribuição.
- **Qualquer mudança de UI/UX tem maqueta antes de implementar**, numa página de maquetas para rever tudo de uma vez.
- Correções sem mudança visual (repor comportamento) avançam sem maqueta.
- Delegar em agentes (Haiku para tarefas mecânicas, Sonnet para correções com causa conhecida, o modelo principal para maquetas, revisão e verificação no browser). Cada agente recebe o ponto, a causa, os ficheiros, o critério de conclusão e «não fazer commit»; o commit é feito depois da revisão.

## Para mais tarde

- **Inglês nas páginas do hóspede, emails e Stripe** (auditoria de 25/11, ponto 2; maqueta 7 aprovada): língua guardada na reserva, seletor PT/EN, listas de países PT/EN.

- **Condições gerais da reserva (à espera da opinião do cliente):** documento formal versionado com PDF, aceite antes de pagar; privacidade como «tomei conhecimento» com versão; marketing opcional. Maqueta pronta.
- **Documentos e aceitações do hóspede:** política de privacidade completa (art. 13.º); regras da casa aceites no pré-check-in; Livro de Reclamações Eletrónico e resolução alternativa de litígios no site, portal e emails; secção «Documentos» no portal. Validar textos com jurista.
- **Reservas no site do cliente:** widget de pesquisa (datas que passam para a reserva), plugin de WordPress, domínio próprio (`reservas.cliente.pt`); instalação no site do cliente como serviço pago.
- **Sites para clientes:** gerador de sites a partir dos dados da plataforma — avaliar só quando a plataforma estiver estável e houver procura. Até lá, a página de reservas serve de mini-site para quem não tem site; sites à medida em WordPress como serviço avulso.
- **Plano e faturação:** pagamento automático da subscrição (Stripe Billing).
- Juntar num único documento os planos espalhados por: `ROADMAP.md`, `MELHORIAS.md`, `ESCOPO-V1-V2.md`, `FECHO-V1-2026-10-24.md`, `PERCURSO-HOSPEDE-2026-11-19.md`, `PLANO-CONSOLA.md`.
- Línguas nos emails: esconder o seletor ou escolher a língua pelo país do hóspede.
