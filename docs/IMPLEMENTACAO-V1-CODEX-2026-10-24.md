# Fecho do bloco de correções V1 — 24/10/2026

> Os sete pontos da secção «O que falta» foram trabalhados no bloco seguinte; ver [FECHO-V1-2026-10-24.md](FECHO-V1-2026-10-24.md). Este documento mantém o registo do bloco do Codex.

## Estado

Bloco de implementação e validação concluído localmente. Alterações do Claude preservadas e incluídas na cópia validada, incluindo os seus 15 novos testes. Sem commit ou publicação efetuados pelo Codex neste bloco. Isto não certifica que toda a V1 está pronta para comercialização.

No fecho, o código backend/frontend da cópia isolada coincide com os ficheiros atuais comparados no manifesto. O novo teste de contas também coincide. A diferença na CI é a inclusão desse teste. Os documentos de âmbito editados pelo Claude foram preservados.

## Correções abrangidas

- Reservas e pagamentos: preservar descontos em edições simples; repetição segura de pagamentos manuais; valores em cêntimos; confirmação da cotação de cancelamento; preservação/validação de dados dos hóspedes e despesas; capacidade pública coerente.
- Emails: ocultar tokens ao staff; validar cabeçalhos; distinguir falha de envio de sucesso; controlar duplicações e resultados incertos; aplicar alojamento e elegibilidade atuais; proteger códigos de acesso.
- Contas e proteção de dados: confirmação de alteração de email, convites com token guardado em hash e aceitação atómica, OAuth associado à sessão e consumido uma vez, limites de pedidos, proteção de CSV e validação de imagens.
- Operação: reconciliação de pagamentos e notificações de acompanhamento, inclusão dos novos registos no backup de dados, atualização de dependências e integração dos checks relevantes na CI.
- As correções adicionais do Claude estão descritas na secção 1b de `ESCOPO-V1-V2.md`. Não foram revertidas nem reimplementadas.

## Validação executada

| Verificação | Resultado |
|---|---|
| Testes Node, incluindo os 15 do Claude | 267/267 passaram |
| Verificação de código e recursos | 238 ficheiros JavaScript; passou |
| HTTP, autenticação e permissões | Passou |
| Regressões funcionais V1 | 12 cenários; passou |
| Segurança e emails V1 | 11 verificações; passou |
| Contas, convites e OAuth | 3 grupos; passou |
| Navegador geral | Passou |
| Mobile Chromium | Passou |
| Mobile WebKit | Execução final passou; ver ressalva abaixo |
| Pré-check-in, voucher público e política de pagamentos | Passaram |
| Auditoria npm dos manifests/lockfiles backend e frontend | 0 vulnerabilidades reportadas na execução |
| `git diff --check` | Passou |

Testes com dados sintéticos, bases isoladas e transportes simulados onde aplicável. Não comprovam entrega real no Gmail, cobranças/reembolsos reais ou publicação. O audit do frontend verifica o inventário npm; não constitui uma auditoria independente de todo o conteúdo dos bundles servidos por CDN. A CI foi configurada, mas não foi executada remotamente nesta sessão.

O teste de browser geral passou após corrigir a sua data de referência para o dia local. Em WebKit houve uma falha inicial ao abrir o separador Preços; uma execução de diagnóstico e uma nova execução sem diagnóstico passaram, sem alteração ao produto. A causa da intermitência não ficou demonstrada. O log da falha foi preservado em `webkit.log`, e o sucesso final em `webkit-final.log`.

Os campos de evidência do teste funcional distinguem agora a repetição do mesmo pagamento (total mantém 50) de um segundo pagamento intencional (total passa a 100), e a cotação antiga recusada (200) da nova cotação aprovada (250). As asserções não foram alteradas nessa clarificação.

## O que falta para fechar a V1

1. **Total no wizard com voucher:** o Claude assinalou que mudar datas mostra temporariamente o total sem desconto, enquanto o servidor grava o desconto. Corrigir a apresentação e validar a concordância antes de confirmar; não dar este percurso por encerrado.
2. **Restauro completo:** ensaio isolado com base de dados, uploads, contas/ligações e chave dos tokens. O roundtrip de tabelas que passou não cobre esses componentes todos.
3. **Google Calendar/Tasks, se usados:** confirmar persistência e recuperação de falhas, alterações e remoções; rever eventuais tarefas órfãs com pré-visualização. Não foi implementada uma fila durável nova de Calendar neste bloco.
4. **Serviços externos reais:** validar Gmail e Stripe Test; depois preparar a passagem a Live no âmbito acordado. Confirmar entrega/recuperação de emails, consentimentos e reconciliação de pagamentos.
5. **Mobile e PWA:** verificar iPhone/Android reais, teclado virtual, rede instável, sessão expirada e atualização da PWA. Investigar a intermitência observada em WebKit se voltar a ocorrer.
6. **Dados pessoais e operação:** definir procedimento de anonimização para hóspedes cujas reservas têm pagamentos e não podem ser apagadas; fechar a cobertura de auditoria, monitorização, retenção e uploads órfãos já identificada no âmbito V1.
7. **Publicação:** rever o diff conjunto, correr a CI na versão identificada, validar migrações/configuração/volumes e preparar rollback e checks pós-publicação. Confirmar também desempenho com volume representativo.

A política de pagamentos mantém o âmbito indicado pelo Claude: site e direto. WhatsApp, Instagram e outro ficam fora; ampliar esse âmbito exigiria uma decisão explícita.

O redesenho visual, novas animações e personalização página a página continuam para V2. Não foram iniciados novos trabalhos dessa fase.

## Evidência

Logs e manifesto SHA-256: `audit/results-v1-codex-2026-10-24/`. Âmbito completo: `ESCOPO-V1-V2.md`. Este documento regista o fecho deste bloco e as limitações; não substitui o âmbito global.
