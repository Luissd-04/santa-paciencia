# Percurso do hóspede — 19 de novembro de 2026

Revisão do percurso da reserva feita no site, dos emails ao hóspede e das
páginas públicas. Ponto de partida: uma simulação completa na branch `testes`
(reserva no site, aprovação, pagamentos, pré-check-in, emails da estadia e
cancelamentos), com o Gmail substituído por uma caixa local.

## Percurso

1. **Pedido.** O pedido do site fica sempre `pendente`, mesmo com a Stripe
   ligada. Antes, com a Stripe, o pedido passava logo a `aguardar_pagamento`
   e o hóspede pagava sem aprovação; o link do pré-check-in nunca seguia por
   email nesse caso.
2. **Aceitação.** Ao aceitar (`reservationLifecycle.approve`), a reserva passa a
   `aguardar_pagamento` e ganha `deposit_deadline`: 48 h para pagar o sinal
   (`DEPOSIT_TTL_HOURS`). O pagamento online só existe a partir daqui.
3. **Prazo do sinal.** `reservationScheduler.expireUnpaidDeposits` cancela as
   reservas aceites sem nenhum pagamento depois do prazo (motivo `deposit`),
   exceto com um pagamento Stripe em curso. O hóspede recebe o email de
   cancelamento com o texto deste motivo e a equipa é avisada.
4. **Pagamentos, chegada e saída** como antes, com os emails abaixo.

## Emails ao hóspede

| Momento | Modelo | Notas |
|---|---|---|
| Pedido enviado | `confirmacao` («Pedido recebido») | Novo neste momento; link para acompanhar o pedido |
| Pedido aceite | `reserva_aceite` (novo) | Sinal pela Stripe, prazo de 48 h e pré-check-in |
| Cada pagamento | `pagamento` | O que completa o sinal diz «Reserva confirmada» |
| Véspera da chegada | `coordenadas` («Tudo para a sua chegada») | Como chegar, como entrar, Wi-Fi, dia da saída; só com a reserva paga |
| Depois da saída | `obrigado` | Link de avaliação do alojamento e voltar a reservar |
| Cancelamento | `cancelamento` | Texto por motivo: `ttl`, `deposit`, `staff`, `guest` |

`apos_checkin` e `antes_checkout` ficam desligados por omissão: o conteúdo
passou para «Tudo para a sua chegada». `pre_checkin` passa a envio manual da
equipa (`timing_event = 'manual'`). A migração `20261119_guest_emails` aplica
os textos novos aos modelos já guardados, com cópia da versão anterior em
`organization_email_templates_backup` (ver `services/emailDesign.js`).

## Dados do alojamento nos emails

Nada nos emails ao hóspede vem fixo no código: saíram o logótipo e o Facebook
de Santa Paciência, o nome «Santa Paciência» como recurso, as horas 15:00 e
11:00 e a licença fictícia `12345/AL` (a migração
`20261119_accommodation_guest_info` limpa-a dos alojamentos e reservas). Os
dados vêm do alojamento (o principal, num quarto) e, em falta, da organização.

Campos novos no alojamento (herdados pelos quartos): `contact_email`,
`contact_phone`, `arrival_instructions`, `entry_instructions`,
`checkout_instructions` (um passo por linha), `review_url` e `no_wifi`.

## Dados obrigatórios e emails retidos

`services/emailReadiness.js` define o que cada email precisa:

- todos: email de contacto, morada, n.º de licença AL, horas de check-in e de
  check-out;
- `reserva_aceite`: a Stripe ligada (se ainda faltar o sinal);
- `coordenadas`: como chegar, como entrar (ou o código da porta), dia da saída;
- `obrigado`: link de avaliação.

O telefone, o logótipo, as redes e o Wi-Fi são opcionais. Sem um dado
obrigatório, o email não sai: fica em `email_holds` e o sino mostra «Email
retido», com o que falta e «Completar o alojamento». Com os dados completos, o
aviso passa a «Pronto a enviar», com **Enviar** e **Ignorar**
(`POST /api/reservations/:id/email-holds/:slug/send|dismiss`). Um email retido
que deixou de fazer sentido (reserva cancelada, chegada já passada) sai sozinho
do sino. Reservas aceites com emails a que vai faltar algo geram «Configuração
por terminar» com antecedência. A ficha do alojamento tem o cartão «Emails aos
hóspedes» com o estado de cada email
(`GET /api/accommodations/:id/email-readiness`).

## Páginas públicas

A versão nova (antes em `?layout=novo`) é a única. Cada página pública tem
`<html data-layout="novo">` (o CSS de `public-novo.css` está preso a esse
atributo) e saíram o seletor de versão (`js/domain/public-layout.js`), o
fundo desfocado, o cabeçalho e as faixas de fotografias da versão antiga, a
barra de passos antiga, a grelha de dados e o bloco de pré-check-in antigos da
página da reserva, com o JS e o CSS que os desenhavam.

- O último passo diz «Enviar pedido» e explica que hoje não se paga nada.
- Depois de enviar, o hóspede vai para a página do pedido (`/reserva/:token`),
  com «Aceitação do alojamento» e, depois de aceite, «Falta o sinal» com o
  prazo.
- O topo e o título usam o nome do alojamento (`brand_name` na API), nunca
  «Santa Paciência»; a página da reserva mostra o email e o telefone do
  alojamento.
- Sem fotografias do alojamento, não aparece nenhuma (antes, uma casa de um
  banco de imagens).
- A localização mostra cidade e país (a região «Continente» vinha de um valor
  por omissão).

## Editor de emails (Definições → Emails aos hóspedes)

- **Lista** pela ordem do percurso (antes da estadia, pagamentos, estadia,
  cancelamentos, enviados pela equipa ou desligados), com o estado de cada
  email para o alojamento escolhido: Pronto, «Falta N dados», Desligado ou
  «Sem uso» (avisos da política, com a política desligada).
- **Quando sai** numa frase («Enviar 1 dia antes da entrada, só entre as…»).
- **Conteúdo em blocos** (`js/features/emails/blocos.js`): parágrafos de texto
  editáveis, com os dados do hóspede e da reserva como etiquetas («Primeiro
  nome»), e blocos automáticos com nome e descrição («Datas da estadia»,
  «Como chegar»…). Cada bloco sobe, desce ou sai; «Acrescentar texto ou
  bloco» mostra primeiro os blocos deste email. Um bloco cujo dado falta no
  alojamento aparece «Em falta», e um aviso no topo diz se o email ficaria
  retido. O corpo continua a ser gravado como HTML com marcadores `{{…}}`.
- **Pré-visualização** ao lado (separadores Texto/Pré-visualização quando o
  painel é estreito), com um alojamento e uma reserva real dele
  (`GET /api/email-templates/preview-reservations`), ou um exemplo por estado;
  com uma reserva real, a composição é a do envio (`emailService.templateContext`).
- **Repor o texto original** (`POST /api/email-templates/:slug/reset`), com
  cópia da versão atual em `organization_email_templates_backup`.
- As línguas ficam num seletor com a nota de que as traduções ainda não são
  usadas no envio. Teste: `scripts/check-email-editor.cjs`.

## Por fazer

- Línguas: decidir se se escondem até haver envio por língua ou se se
  implementa a escolha da língua pelo país do hóspede.
