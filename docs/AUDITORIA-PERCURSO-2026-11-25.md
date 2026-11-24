# Auditoria do percurso: hóspede, reserva e avisos à equipa — 25/11/2026

Três frentes, testadas na app verdadeira com dados sintéticos, a Stripe simulada e o Gmail substituído por uma caixa local (todos os emails foram lidos):

- **A. Hóspede estrangeiro:** reserva de ponta a ponta em inglês (telemóvel, 390 px) e em português (computador), com 4 hóspedes, 74 capturas e 14 emails.
- **B. Ciclo da reserva:** todos os estados, prazos, valores e edições a meio, em 10 cenários com o relógio avançado.
- **C. Avisos à equipa:** sino, som, push, email, Calendar e Tasks, com 3 papéis e preferências.

Os pontos marcados ✔ foram confirmados também por mim, no código ou nas capturas. As evidências (capturas, emails e scripts) estão na pasta de rascunho da sessão: `auditoria/A`, `auditoria/B` e `auditoria/C`.

## Resumo

Para quem fala português e num percurso normal, o caminho é claro e bem desenhado:
- «Hoje não paga nada», passos «Feito/Agora», preço detalhado com a tabela de reembolso;
- o portal na véspera tem código da porta, Wi-Fi, mapa e WhatsApp;
- os emails são coerentes com as páginas;
- o núcleo técnico é sólido: anti-duplicação, expirações, cancelamento com política e Stripe.

Os problemas concentram-se em quatro zonas:
1. **O hóspede estrangeiro não tem nada em inglês.**
2. **O dinheiro:** o sinal anunciado não é o valor cobrado, o voucher desconta a taxa turística, e há reservas com dinheiro que ninguém vê.
3. **O que acontece a meio:** editar uma reserva paga, cancelar com dinheiro recebido, reativar, mudar datas.
4. **A equipa não é avisada de dinheiro:** pagamento recebido só por push, pagamento falhado e reembolso sem aviso.

## Prioridades

### Bloqueantes (antes de abrir a mais alojamentos)
| # | Problema | Onde |
|---|---|---|
| 1 ✔ | **O sinal anunciado não é o valor cobrado sem política de pagamento.** O email «Reserva aceite» e a ficha dizem 154,50 €, mas o portal e a Stripe cobram 309 € (o total). | `services/paymentPolicy.js` (`amountDue` contra `requiredDepositCents`), `emailService.js` (`valor_sinal`) |
| 2 ✔ | **Nada existe em inglês.** Páginas, erros, listas de países, 14 emails e a própria Stripe (`locale: 'pt'`). O `description_en` do alojamento nunca aparece. | `frontend/public-reservation.html`, `reservation-status*`, `pre-checkin*`, `stripePayments.js:125` |
| 3 | **Sem Stripe, o email «Reserva aceite» fica retido mas o prazo de 48 h corre.** O hóspede é cancelado sem nunca saber que foi aceite. | `emailReadiness.js:22`, `reservationLifecycle.approve` |

### Importantes
| # | Problema | Frente |
|---|---|---|
| 4 ✔ | O desconto do voucher também se aplica à taxa turística (cliente e servidor) | A/B |
| 5 ✔ | Pagamento recebido só avisa por push: sem email nem sino; sem push ativo, o proprietário não sabe | C |
| 6 | Pagamento falhado e reembolso Stripe não avisam ninguém (só «por reconciliar» passadas 23 h) | C |
| 7 | Editar preço ou datas com o sinal pago desliga a cobrança e os avisos do restante, ou faz a reserva recuar para «Aguarda sinal» para sempre, sem email | B |
| 8 | Dinheiro numa reserva cancelada: portal com «Falta 154,50 €», pagamento que chega depois de cancelar e reembolso feito no painel Stripe ficam invisíveis à equipa | B |
| 9 ✔ | Logo depois de pagar o sinal, aparece um grande «Pagar 122,85 € online» com o mesmo valor (risco de pagar duas vezes) | A |
| 10 | «Voltar» do browser sai do formulário e perde todos os dados | A |
| 11 | O link do pré-check-in expira na saída original depois de mudar as datas | B |
| 12 | Reativar uma reserva expirada é desfeito pelo scheduler, com novo email ao hóspede | B |
| 13 | O prazo do sinal pode passar da data de entrada; um sinal parcial nunca expira | B |
| 14 | Painel, ficha, calendário e portal com totais e rótulos diferentes: «568 € em falta» contra 259 €, «AGUARDAR_PAGAMENTO» na timeline, «Aguarda sinal» igual a «Confirmada» no mês | B |
| 15 | O aviso de consentimento em falta no pagamento aparece fora do ecrã: o botão parece não fazer nada | A |
| 16 | Depois de aceitar, a reserva sai do sino («Aguarda sinal» invisível) e não há pré-aviso antes de expirar | C |
| 17 | O email à equipa perde-se em silêncio sem Gmail ligado (fica «done», sem «Aviso não entregue») | C |
| 18 | Os pushes de pagamento e de cancelamento têm a tag fixa: dois seguidos substituem-se no telemóvel | C |
| 19 | O erro «estadia mínima» fica visível depois de corrigir as datas | A |
| 20 | Cancelamento pelo hóspede: «Reembolso previsto… Processamento concluído», sem prazo nem para onde vai | A |
| 21 | Cancelar pelo formulário uma reserva com política dá um 409 enganador | B |

### Melhorias
- **Hóspede (A):**
  - listas de países só em português;
  - nome do acompanhante obrigatório logo no pedido;
  - a casa inteira aparece «Escolhido» antes de haver datas;
  - formatos de data diferentes de página para página, e o prazo sem indicação do fuso;
  - painel lateral com «Total estimado» e «Extras 0 €»;
  - assuntos iguais nos dois emails de pagamento;
  - «As datas são suas» no email de aceitação;
  - fim do pré-check-in só com «Pagar reserva online»;
  - jargão (RGPD, SIBA, NIF, NIE, sinal), «tu» e artigos em falta («em Quarto Sobreiro»);
  - links inválidos sem contacto.
- **Reserva (B):**
  - nada passa a reserva para check-in e check-out sozinho («Chegada hoje» numa estadia que já acabou);
  - o email do último pagamento chama-lhe «sinal» com o valor errado;
  - a taxa turística é cobrada também a crianças, sem isenção configurável;
  - `review_required` herdado de edições anteriores;
  - «48 horas» fixo nos textos;
  - recusar um pedido envia o email genérico de cancelamento;
  - um duplo clique em «Aprovar» mostra erro depois de ter funcionado.
- **Equipa (C):**
  - a hora no sino é a da primeira consulta, não a do facto;
  - aparece texto técnico no sino («staff push payment · socket hang up»);
  - um «Email retido» por email e por reserva (ruído);
  - o funcionário recebe valores em dinheiro;
  - o pagamento manual do gestor não avisa o proprietário;
  - o resumo diário abre a lista e não a reserva;
  - voucher usado sem aviso;
  - não existe caminho para mensagens do hóspede para a equipa.

## Mapa de avisos à equipa (hoje)

| Evento | Push | Email | Sino |
|---|---|---|---|
| Novo pedido do site | ✔ (todos, por reserva) | ✔ proprietário e gestor | ✔ enquanto pendente |
| Pedido aceite, a aguardar sinal | — | — | — |
| Pagamento recebido (Stripe ou automático) | ✔ todos | — | — |
| Pagamento manual | — | — | — |
| Pagamento falhado ou reembolso | — | — | só gestor+, passadas 23 h ou com política |
| Pré-check-in feito | ✔ | — | — |
| Pedido ou sinal a expirar | — | — | — |
| Expirou (pedido, sinal) ou foi cancelada | ✔ | ✔ proprietário e gestor | — |
| Chegadas e saídas | resumo diário às 08:00 | — | «Check-in hoje/amanhã», «Check-out hoje» |
| Voucher usado, mensagem do hóspede | — | — | — |

## O que está bem
- **Anti-duplicação:** pedidos em paralelo, duplo clique, aprovar e pagar em paralelo; cancelar com um pagamento em curso é recusado.
- **Expirações:** por pedido e por sinal libertam as datas e o voucher, com o email certo ao hóspede e à equipa.
- **Cancelamento com política:** reembolso pela Stripe, arredondamentos certos e email com valores.
- **Portal e emails da estadia:** códigos e Wi-Fi só com a reserva paga e na janela certa; «Obrigado» depois da saída.
- **Ligações dos avisos:** abrem sempre a reserva certa; quem faz a ação não recebe o próprio push; as preferências de push são respeitadas.
- **Página embutida no site do cliente:** funciona, e a confirmação abre num separador novo para pagar.

## Proposta de ordem
1. **Dinheiro certo** (1, 4, 13) e **avisos de dinheiro** (5, 6, 17, 18): correções no backend, sem maqueta.
2. **Pagar sem confusão** (9, 15, 19, 20): pequenas mudanças de interface, com maqueta.
3. **O que acontece a meio** (3, 7, 8, 11, 12, 21): decisões de produto primeiro (ver abaixo).
4. **Inglês** (2 e as listas de países): o maior trabalho, que inclui a língua guardada na reserva e os emails traduzidos.
5. **Coerência da equipa** (14, 16) e as melhorias.

**Decisões de produto necessárias:**
- **Sem política de pagamento:** cobra-se um sinal (50 %) ou o total?
- **Sem Stripe:** o email de aceitação leva instruções de pagamento manual e o prazo das 48 h mantém-se?
- **Editar uma reserva já paga:** o hóspede tem de voltar a aceitar as condições?
- **Taxa turística:** as crianças pagam ou estão isentas?
