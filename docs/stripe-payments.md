# Pagamentos de reservas com Stripe

O checkout é alojado pela Stripe. A aplicação não recolhe números de cartão nem precisa de uma publishable key no frontend. Test é o modo padrão; Live exige ativação explícita e só funciona com `NODE_ENV=production`.

## Configurar

Em `backend/src/.env` (nunca no frontend nem no Git), preencher:

```dotenv
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_ORGANIZATION_ID=ID_DA_ORGANIZACAO
PUBLIC_APP_URL=http://localhost:3001
```

Usar HTTPS no servidor público. `PUBLIC_APP_URL` deve ser apenas a origem, sem caminhos. Obter o ID da organização na instalação; uma consulta local `SELECT id, name FROM organizations` permite identificá-la. Esta integração liga uma conta Stripe a uma organização explicitamente; não distribui cobranças entre várias organizações/contas Stripe Connect.

`STRIPE_MODE` aceita apenas `test` ou `live`. A chave tem de pertencer ao mesmo ambiente (`sk_test_`/`rk_test_` ou `sk_live_`/`rk_live_`). Sem a configuração completa, conserva-se o fluxo de aprovação manual. Com a configuração completa, **novas reservas públicas pagáveis** ficam em `aguardar_pagamento`; o pagamento integral confirma-as quando a política faseada está desativada; com política ativa, basta o sinal contratado. Reservas antigas em `pendente` continuam a precisar de aprovação. Valores zero ou inferiores ao mínimo de 0,50 EUR seguem o fluxo manual.

Instalar dependências em `backend/src` com `npm ci` e reiniciar o backend. As migrações correm no arranque. Fazer uma cópia de segurança da base antes de atualizar o servidor.

## Métodos de pagamento

Ativar no Dashboard Stripe, no ambiente correspondente, os métodos pretendidos: cartões (Visa/Mastercard), MB WAY e os outros métodos compatíveis com a conta, moeda e transação. Checkout seleciona dinamicamente os métodos elegíveis. Apple Pay e Google Pay aparecem quando a conta, dispositivo e browser são elegíveis; não são botões que a aplicação força a aparecer.

MB WAY está suportado no Checkout em EUR e precisa de estar ativado na conta. Também se pode ativar Multibanco quando elegível; é um método com confirmação diferida, pelo que a reserva pode ficar à espera durante mais tempo. Não ativar métodos com prazos incompatíveis com a política do alojamento.

Referências: [MB WAY](https://docs.stripe.com/payments/mb-way), [métodos dinâmicos](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods), [Checkout](https://docs.stripe.com/payments/checkout).

## Webhook

Endpoint: `POST /api/stripe/webhook`.

Subscrever estes eventos no ambiente selecionado, para a própria conta (não eventos Connect):

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
payment_intent.processing
charge.refunded
refund.created
refund.updated
refund.failed
```

Para testes locais, com a Stripe CLI autenticada na conta de teste:

```sh
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Guardar o `whsec_...` devolvido pela CLI no `.env` e reiniciar. O segredo da CLI é diferente do segredo do endpoint registado no Dashboard. Em alojamento público, registar `https://SEU_DOMINIO/api/stripe/webhook` e usar o segredo desse endpoint.

Test e Live têm endpoints/segredos de assinatura separados. O endpoint recebe o corpo original antes do parser JSON e valida a assinatura com o SDK oficial e a sua tolerância temporal. Também recusa eventos cujo `livemode` não corresponda a `STRIPE_MODE`. Um erro de processamento não é marcado como concluído: a Stripe pode repeti-lo. Não desativar a assinatura para testar.

## Fluxo e estados

1. O motor público calcula alojamento, noites, serviços, ocupação e voucher no servidor, verificando disponibilidade dentro da transação da reserva.
2. O hóspede segue para `/reserva/:token` e carrega em pagar. `POST /api/public/reservation/:token/checkout` identifica a reserva pelo token de 256 bits. O corpo do pedido não controla preço, moeda, identidade nem URLs; apenas transmite a aceitação das condições e a autorização opcional do cartão.
3. O backend cobra em EUR o sinal em falta ou o restante, segundo a política guardada na reserva; sem política, cobra o total menos os pagamentos do ledger. Preserva preços negociados por gestores; não recalcula uma estadia antiga com tarifas atuais.
4. Cada tentativa tem um pedido persistido e uma chave de idempotência. Pedidos simultâneos reutilizam a tentativa. A sessão dura uma hora.
5. O webhook obtém o estado atual diretamente da Stripe, verifica metadata, IDs, moeda e montante e atualiza, numa transação, o ledger, a reserva e a deduplicação do evento. Não confia no regresso à página de sucesso.
6. A página mostra a confirmação persistida e consulta novamente o estado por até um minuto; depois permite atualização manual.

`payment_status` conserva `pendente`, `parcial`, `confirmado`, `reembolsado`. O campo separado `online_payment_status` descreve a tentativa: `pending`, `processing`, `failed`, `expired`, `cancelled`, `paid`, `partially_refunded`, `refunded`, `review_required`. Uma tentativa falhada não apaga pagamentos anteriores. Com política faseada, o cancelamento por falta de pagamento depende do aviso e do prazo adicional descritos abaixo.

Os campos `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount` e `payment_currency` ficam na reserva. `payment_amount` é o valor em euros da tentativa mais recente; o ledger e as tentativas guardam o histórico completo. Todos os cálculos de comparação/cobrança usam cêntimos inteiros.

Cancelar a navegação no Checkout permite retomar; não cancela a reserva. Editar/cancelar a reserva na gestão expira primeiro uma sessão aberta na Stripe. Pagamentos já em processamento impedem estas alterações até se conhecer o resultado. Um pagamento recebido para uma reserva entretanto cancelada/alterada é registado e sinalizado para revisão, sem reconfirmar a estadia.

O scheduler reconcilia tentativas abertas com a API Stripe antes de aplicar o TTL existente (`PUBLIC_PENDING_TTL_HOURS`, 48h por omissão). Reservas com tentativas ainda incertas/em processamento não são libertadas. Em caso de falha de rede mantém-se a ocupação por segurança. Uma criação sem resposta durante mais de 23h exige reconciliação operacional na conta Stripe antes de libertar a tentativa: não se cria outra cobrança depois do prazo de retenção da chave de idempotência.

## Pagamentos e cancelamentos configuráveis

Em **Definições → Pagamentos e cancelamentos**, um gestor pode editar e simular:

- **Pagamento inicial**: percentagem do total por intervalo de dias entre criação e check-in.
- **Reembolso**: percentagem do montante já pago, com uma segunda tabela independente. A base pode ser os dias entre criação e check-in ou entre cancelamento e check-in.
- **Restante**: dias antes do check-in, autorização para cobrança automática e horas adicionais após aviso de pagamento em falta.

Os intervalos incluem ambos os limites, começam em zero e cobrem todos os dias sem lacunas nem sobreposições; o último limite superior fica vazio. Podem ser adicionados/removidos. A política começa **desativada**, com valores exemplificativos. Guardar sem ativar permite preparar as regras. O simulador usa os valores do formulário, mesmo por guardar.

Ao ativar, apenas novas reservas recebem uma cópia das regras, incluindo as criadas manualmente. As anteriores mantêm o funcionamento existente. Cada reserva conserva a sua política após alterações às definições. Alterar datas, alojamento ou total da própria reserva invalida a aceitação e autorização anteriores; o hóspede tem de voltar a aceitar antes de pagar, e não há cobrança automática enquanto isso não acontecer.

Na ficha da reserva, **Copiar link da reserva e pagamento** partilha a página privada `/reserva/:token`. Funciona também para reservas manuais elegíveis. O hóspede vê valores, vencimento e reembolsos antes de aceitar; pode pagar o restante antecipadamente. Uma página desatualizada não autoriza uma cobrança maior. O sinal confirma a reserva com pagamento parcial; o pré-check-in preserva essa confirmação. Pagamentos manuais também contam para atingir o sinal.

Reservas criadas já dentro do prazo do restante pagam 100% inicialmente. O vencimento é às 12:00 de Lisboa, com mudança de hora respeitada. Os cálculos são em cêntimos; ajustam-se prestações inferiores ao mínimo Stripe de 0,50 €. O simulador e a página do hóspede identificam esse ajuste.

### Cobrança do restante

Só cartões guardados através do Checkout, com autorização explícita para esta reserva, são usados numa tentativa automática `off_session`. MB WAY e pagamentos sem autorização recebem um link para pagar. A Stripe pode exigir nova autenticação ou recusar o cartão. O scheduler existente verifica as reservas no arranque e de 30 em 30 minutos (configurável por `PENDING_EXPIRY_INTERVAL_MS`); o vencimento não é uma garantia de execução ao segundo.

Se o pagamento continuar em falta, envia-se um aviso com link e prazo, através da ligação Gmail da organização. São necessários email válido do hóspede, Gmail ligado e envio de email ativo. O prazo adicional só começa depois de um envio bem-sucedido, nunca retroativamente. Sem aviso enviado, com pagamento em processamento, resposta incerta da Stripe ou reembolso externo a precisar de revisão, não se cancela automaticamente. A gestão deve acompanhar estes casos na ficha da reserva.

Depois do prazo, sem pagamento confirmado e com reconciliação Stripe concluída, a reserva é cancelada sem devolver o sinal. Uma tentativa incerta usa sempre a mesma chave de idempotência; depois de 23 horas sem resultado, requer reconciliação operacional, evitando repetir a cobrança como uma operação nova.

### Cancelamentos e reembolsos

O hóspede pode consultar o reembolso e cancelar pelo seu link até ao dia de check-in; a gestão pode cancelar na ficha. Primeiro reconciliam-se pagamentos e encerram-se sessões abertas. O reembolso é a percentagem contratada do saldo já pago, distribuída pelos pagamentos Stripe disponíveis. Operações e chaves são guardadas antes do pedido remoto, permitindo recuperação após reinício ou perda de resposta sem duplicar o reembolso.

A ficha mostra processamento concluído, pendente ou revisão manual. Valores recebidos fora da Stripe e reembolsos recusados/incertos precisam de tratamento manual pelo alojamento. O estado concluído significa que a Stripe confirmou o reembolso, não que o banco já o creditou. Reativar uma reserva com cancelamento financeiro fica bloqueado; uma nova estadia deve ter uma nova reserva. As comissões originais da Stripe não são deduzidas ao montante contratual do hóspede.

## Passar para Live

1. Ativar a conta Stripe e configurar conta bancária, dados do negócio e métodos de pagamento Live.
2. Criar uma chave restrita Live com as permissões necessárias para pagamentos pontuais.
3. Criar um endpoint webhook **Live** em `https://SEU_DOMINIO/api/stripe/webhook`, com os eventos acima, e copiar o seu novo `whsec_...`.
4. No servidor, configurar `STRIPE_MODE=live`, a chave `rk_live_...`/`sk_live_...`, o segredo Live, o ID da organização e o URL HTTPS. Reiniciar o backend.
5. Fazer uma cobrança real de valor baixo com um cartão real e reembolsá-la no Dashboard. Nunca usar números de cartão de teste em Live.

As tentativas guardam o ambiente a que pertencem. Ao promover Test para Live, sessões de teste abertas deixam de bloquear uma nova cobrança real; uma tentativa Live em curso nunca é descartada ao voltar a Test.

## Reembolsos e conservação

Efetuar reembolsos no Dashboard Stripe do ambiente correspondente. Reembolsos concluídos, parciais ou totais, produzem movimentos negativos no ledger; os pendentes/falhados não reduzem o saldo. A interface não permite apagar movimentos Stripe. Nas reservas com política, cancelar pela aplicação ordena o reembolso contratual, após confirmação do montante. Os restantes reembolsos continuam a ser feitos no Dashboard Stripe. Após um reembolso não se oferece automaticamente uma nova cobrança ao hóspede.

Reservas com tentativas Stripe não podem ser apagadas definitivamente. Os backups de dados (versão 8) incluem as tentativas e o respetivo ambiente. Não é permitido restaurar pagamentos em curso, transferi-los para outra organização nem substituir histórico Stripe por um backup financeiro desatualizado. O restauro também preserva políticas, consentimentos e operações agendadas; não permite transferi-los para outra organização. Para recuperação integral de uma instalação, conservar também backups consistentes da base SQLite e da configuração do servidor. Um backup anterior aos pagamentos não serve para reverter o estado financeiro.

Os logs registam IDs, estado e códigos de erro; não registam o corpo do webhook, segredos nem dados de cartão.

## Validar

```sh
cd backend/src
npm test
npm run check
node scripts/check-stripe-browser.cjs
node scripts/check-payment-policy-browser.cjs
```

Os testes locais usam base descartável e uma Stripe simulada, com assinaturas geradas pelo SDK. Cobrem concorrência, preço forjado, isolamento, assinaturas inválidas, repetição/ordenação de eventos, pagamentos diferidos, falhas, expiração, reembolsos, rollback e o fluxo HTTP.

Antes de disponibilizar a integração, executar também na **conta Stripe de teste real**:

- Criar uma reserva pública e pagar com um cartão de teste oficial; confirmar estado e valor na aplicação e Dashboard.
- Testar falha e autenticação adicional usando os [dados de teste Stripe](https://docs.stripe.com/testing).
- Testar MB WAY com os [números de teste oficiais](https://docs.stripe.com/payments/mb-way/accept-a-payment#test-your-integration).
- Sair do Checkout e retomá-lo; expirar uma sessão; repetir um evento no Dashboard.
- Pagar só o sinal com autorização do cartão; testar o restante automático, recusa/autenticação adicional, aviso, pagamento por link e cancelamento após o prazo.
- Fazer um cancelamento com reembolso parcial pela aplicação; repetir o pedido e os webhooks, e confirmar ledger e estados.
- Verificar reservas manuais, MB WAY sem automatização e a entrega dos avisos por Gmail.
- Verificar Apple Pay/Google Pay num dispositivo elegível e os métodos efetivamente ativados na conta.

Testes simulados não comprovam as capacidades da conta nem substituem estes testes. Depois da validação Test, a passagem a cobranças reais exige `STRIPE_MODE=live`, credenciais Live separadas e `NODE_ENV=production`.
