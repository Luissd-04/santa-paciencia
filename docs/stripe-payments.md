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

`STRIPE_MODE` aceita apenas `test` ou `live`. A chave tem de pertencer ao mesmo ambiente (`sk_test_`/`rk_test_` ou `sk_live_`/`rk_live_`). Sem a configuração completa, conserva-se o fluxo de aprovação manual. Com a configuração completa, **novas reservas públicas pagáveis** ficam em `aguardar_pagamento`; o pagamento integral confirma-as. Reservas antigas em `pendente` continuam a precisar de aprovação. Valores zero ou inferiores ao mínimo de 0,50 EUR seguem o fluxo manual.

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
2. O hóspede segue para `/reserva/:token` e carrega em pagar. `POST /api/public/reservation/:token/checkout` identifica a reserva pelo token de 256 bits. O corpo do pedido não controla preço, moeda, identidade nem URLs.
3. O backend cobra em EUR o total guardado/validado no servidor menos os pagamentos do ledger. Preserva preços negociados por gestores; não recalcula uma estadia antiga com tarifas atuais.
4. Cada tentativa tem um pedido persistido e uma chave de idempotência. Pedidos simultâneos reutilizam a tentativa. A sessão dura uma hora.
5. O webhook obtém o estado atual diretamente da Stripe, verifica metadata, IDs, moeda e montante e atualiza, numa transação, o ledger, a reserva e a deduplicação do evento. Não confia no regresso à página de sucesso.
6. A página mostra a confirmação persistida e consulta novamente o estado por até um minuto; depois permite atualização manual.

`payment_status` conserva `pendente`, `parcial`, `confirmado`, `reembolsado`. O campo separado `online_payment_status` descreve a tentativa: `pending`, `processing`, `failed`, `expired`, `cancelled`, `paid`, `partially_refunded`, `refunded`, `review_required`. Uma tentativa falhada não cancela a reserva nem apaga pagamentos anteriores.

Os campos `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount` e `payment_currency` ficam na reserva. `payment_amount` é o valor em euros da tentativa mais recente; o ledger e as tentativas guardam o histórico completo. Todos os cálculos de comparação/cobrança usam cêntimos inteiros.

Cancelar a navegação no Checkout permite retomar; não cancela a reserva. Editar/cancelar a reserva na gestão expira primeiro uma sessão aberta na Stripe. Pagamentos já em processamento impedem estas alterações até se conhecer o resultado. Um pagamento recebido para uma reserva entretanto cancelada/alterada é registado e sinalizado para revisão, sem reconfirmar a estadia.

O scheduler reconcilia tentativas abertas com a API Stripe antes de aplicar o TTL existente (`PUBLIC_PENDING_TTL_HOURS`, 48h por omissão). Reservas com tentativas ainda incertas/em processamento não são libertadas. Em caso de falha de rede mantém-se a ocupação por segurança. Uma criação sem resposta durante mais de 23h exige reconciliação operacional na conta Stripe antes de libertar a tentativa: não se cria outra cobrança depois do prazo de retenção da chave de idempotência.

## Passar para Live

1. Ativar a conta Stripe e configurar conta bancária, dados do negócio e métodos de pagamento Live.
2. Criar uma chave restrita Live com as permissões necessárias para pagamentos pontuais.
3. Criar um endpoint webhook **Live** em `https://SEU_DOMINIO/api/stripe/webhook`, com os eventos acima, e copiar o seu novo `whsec_...`.
4. No servidor, configurar `STRIPE_MODE=live`, a chave `rk_live_...`/`sk_live_...`, o segredo Live, o ID da organização e o URL HTTPS. Reiniciar o backend.
5. Fazer uma cobrança real de valor baixo com um cartão real e reembolsá-la no Dashboard. Nunca usar números de cartão de teste em Live.

As tentativas guardam o ambiente a que pertencem. Ao promover Test para Live, sessões de teste abertas deixam de bloquear uma nova cobrança real; uma tentativa Live em curso nunca é descartada ao voltar a Test.

## Reembolsos e conservação

Efetuar reembolsos no Dashboard Stripe do ambiente correspondente. Reembolsos concluídos, parciais ou totais, produzem movimentos negativos no ledger; os pendentes/falhados não reduzem o saldo. A interface não permite apagar movimentos Stripe. Esta versão não inclui um botão para ordenar reembolsos na aplicação. Após um reembolso não se oferece automaticamente uma nova cobrança ao hóspede.

Reservas com tentativas Stripe não podem ser apagadas definitivamente. Os backups de dados (versão 7) incluem as tentativas e o respetivo ambiente. Não é permitido restaurar pagamentos em curso, transferi-los para outra organização nem substituir histórico Stripe por um backup financeiro desatualizado. Para recuperação integral de uma instalação, conservar também backups consistentes da base SQLite e da configuração do servidor. Um backup anterior aos pagamentos não serve para reverter o estado financeiro.

Os logs registam IDs, estado e códigos de erro; não registam o corpo do webhook, segredos nem dados de cartão.

## Validar

```sh
cd backend/src
npm test
npm run check
node scripts/check-stripe-browser.cjs
```

Os testes locais usam base descartável e uma Stripe simulada, com assinaturas geradas pelo SDK. Cobrem concorrência, preço forjado, isolamento, assinaturas inválidas, repetição/ordenação de eventos, pagamentos diferidos, falhas, expiração, reembolsos, rollback e o fluxo HTTP.

Antes de disponibilizar a integração, executar também na **conta Stripe de teste real**:

- Criar uma reserva pública e pagar com um cartão de teste oficial; confirmar estado e valor na aplicação e Dashboard.
- Testar falha e autenticação adicional usando os [dados de teste Stripe](https://docs.stripe.com/testing).
- Testar MB WAY com os [números de teste oficiais](https://docs.stripe.com/payments/mb-way/accept-a-payment#test-your-integration).
- Sair do Checkout e retomá-lo; expirar uma sessão; repetir um evento no Dashboard.
- Fazer um reembolso parcial e depois o restante; confirmar ledger e estados.
- Verificar Apple Pay/Google Pay num dispositivo elegível e os métodos efetivamente ativados na conta.

Testes simulados não comprovam as capacidades da conta nem substituem estes testes. Depois da validação Test, a passagem a cobranças reais exige `STRIPE_MODE=live`, credenciais Live separadas e `NODE_ENV=production`.
