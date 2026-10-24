# Classificação consolidada: versão 1.0 e versão 2.0

Decisão proposta em 24 de outubro de 2026, para o objetivo de estabilizar o programa atual antes de reconstruir a experiência página a página.

**V1:** funcionamento correto, valores e dados preservados, permissões respeitadas, falhas visíveis e recuperação praticável. **V2:** personalização, novas capacidades, otimizações e reorganizações que não sejam necessárias para corrigir um problema funcional.

Esta classificação reúne as revisões de 8, 19 e 23 de outubro, o backlog técnico e o roadmap. Não é uma nova execução de testes. P1/P2 nos relatórios indicam prioridade técnica: **P2 não significa automaticamente versão 2**. Uma perda de dados de prioridade média continua a pertencer à V1.

Assume-se que as funcionalidades atuais se destinam a ser usadas. «V1 se ativo» significa que a integração deve ser fiável antes de entrar em serviço. Pode ficar fora do lançamento por decisão explícita de âmbito, com a funcionalidade indisponível e um procedimento alternativo; não deve aparecer como funcional com erros conhecidos. Nenhuma funcionalidade foi desativada por este documento.

## 1. Os 17 achados da revisão funcional

Todos pertencem à V1, com o âmbito mínimo indicado. Estado em 24/10: **corrigidos no código local, ainda não publicado**. Os cenários negativos passaram a testes de aceitação (`scripts/check-v1-functional.cjs`, `scripts/check-v1-security-email.cjs`), executados na CI, e `npm audit --omit=dev` devolve 0 avisos no backend e no frontend (V1-17). Falta a publicação e as validações externas da secção 4.

| ID | Achado | Versão | Mínimo necessário para fechar |
|---|---|---|---|
| V1-01 | Staff cancela através do token público | V1 | Corrigir respostas e permissões; testar as rotas alternativas. |
| V1-02 | Alterar chegada/notas perde descontos ou voucher | V1 | Preservar preço e desconto em alterações não financeiras. |
| V1-03 | Repetir pagamento após resposta perdida duplica o recebido | V1 | Identificar a mesma intenção de pagamento e impedir duplicação. |
| V1-04 | Recebido zero conserva estado «confirmado» | V1 | Estado financeiro coerente com montantes e movimentos. |
| V1-05 | Cancelamento ignora a cotação aprovada | V1 | Rejeitar cotação desatualizada e pedir nova confirmação do montante. |
| V1-06 | Injeção de cabeçalhos de email | V1 se envio ativo | Validação central antes de qualquer transporte. |
| V1-07 | Mensagem aparece enviada sem Gmail ligado | V1 | Mostrar enviado/pendente/falhado de acordo com o resultado real. |
| V1-08 | Templates enviados duas vezes em concorrência | V1 se envio ativo | Reclamação exclusiva da intenção e recuperação de resultado incerto. |
| V1-09 | Scheduler perde hora/localidade/configuração de redes | V1 se automação ativa | Contexto correto e coerente com o alojamento. |
| V1-10 | Email de cancelamento sai depois de reativar a reserva | V1 se automação ativa | Invalidar mensagens obsoletas antes do envio. |
| V1-11 | Código de porta tem regras distintas no envio manual | V1 | Definir e aplicar a regra; exceção manual só se deliberada, autorizada e registada. |
| V1-12 | Editar telefone apaga VIP/favorito/indesejado | V1 | Preservar campos omitidos. |
| V1-13 | Despesas aceitam datas/valores malformados | V1 | Validar criação, edição e importação. |
| V1-14 | Casa inteira é apresentada com lotação por quarto | V1 se reserva pública ativa | Disponibilidade/capacidade coerentes com a unidade vendida. |
| V1-15 | Arredondamento pode marcar pagamento completo como parcial | V1 | Usar cêntimos e regras monetárias consistentes. |
| V1-16 | Limpar telefone não remove o valor guardado | V1 | Distinguir omissão de limpeza e confirmar a persistência correta. |
| V1-17 | Dependências com avisos de segurança | V1 | Atualizar as afetadas ou documentar a não exposição concreta; verificar bundles realmente servidos e repetir testes. |

Reclassificação deliberada: V1-11/12/13/15/16 tinham P2 na revisão funcional. São necessários para uma V1 fiável, embora possam ser corrigidos depois dos bloqueadores de maior impacto.

## 1b. Revisão de código de 24/10: novos defeitos, todos V1 e corrigidos localmente

Encontrados por leitura e reproduzidos em base sintética; cobertos por `test/review-2026-10-24.test.cjs`.

| Assunto | Defeito | Correção |
|---|---|---|
| Pré-check-in | Reserva confirmada sem política (pagamento à chegada, outros canais) passava a «aguardar pagamento» após o hóspede submeter o pré-check-in. | Fica `confirmada`; só aguarda pagamento com política e sinal em falta. |
| Expiração por TTL | Reserva do site aprovada e com pré-check-in feito era cancelada na passagem seguinte (TTL contado desde a criação), sem aviso nem histórico. | O TTL só cancela pedidos nunca aprovados; regista no histórico, avisa o hóspede (modelo «cancelamento») e liberta o voucher. |
| Voucher ao mudar datas | A proteção verificava uma coluna inexistente: mover datas no calendário perdia o desconto (180 € → 200 €) e o voucher ficava gasto. | O voucher volta a ser aplicado à nova estadia; se a deixar de cumprir (noites mínimas, alojamento), pede confirmação do total (409). |
| Crédito de estadia | Um voucher de N noites descontava N euros. | Desconta o preço das primeiras N noites; percentagens arredondadas ao cêntimo (servidor e páginas). |
| Acompanhantes | Cada gravação no wizard criava novas fichas de acompanhantes sem email; um acompanhante com o email do titular renomeava o titular. | O id da ficha é preservado; o email do titular nunca identifica um acompanhante. |
| Emails | Mensagens agendadas (chegada/saída) saíam para pedidos por aprovar; endereços de marcador (`@reserva.local`, `@sem-email.local`) eram enviados ao Gmail; um envio incerto podia ser repetido com conteúdo atualizado. | Só reservas aceites recebem mensagens agendadas; marcadores nunca são destinatários; um envio incerto bloqueia novas versões até a equipa o resolver nas Notificações («Já foi entregue» / «Enviar de novo»), com registo no histórico. |
| Stripe | Editar notas ou hora de chegada expirava o checkout aberto do hóspede. | Só alterações de estadia, montantes ou estado interrompem o pagamento em curso. |
| Reserva pública | Aceitava datas passadas. | Recusa e marca-as indisponíveis (dia de Lisboa). |
| Datas «hoje» no frontend | ~20 pontos calculavam o dia em UTC (D05). | Dia local em todos os pontos operacionais. |
| Limites monetários | Validação aceitava até 10 M€, a política só até 999 999,99 € (a ficha dava erro). | Limite comum de 999 999,99 €; total zero conta como liquidado. |
| Aprovação | Podia fazer recuar uma estadia em curso/terminada para pré-check-in. | Recusada (409). |

Decisões de produto tomadas em 24/10:

- **Vouchers:** um cancelamento liberta a utilização só se a reserva nunca recebeu dinheiro; reativar volta a consumi-la e é recusado se o voucher já não estiver disponível (fecha a pendência D05 sobre vouchers).
- **Política de pagamentos:** aplica-se apenas aos canais `website` e `direto`. A migração `20261024_policy_channels` retira-a de reservas de outros canais que nunca a aceitaram nem pagaram online.
- **Staff:** só leitura nas fichas de hóspedes (criar/editar exige manager).
- **Eliminação definitiva:** recusada sempre que a reserva tenha movimentos de pagamento, mesmo com saldo zero.

## 1c. Bloco de fecho de 24/10 (Claude): defeitos encontrados e trabalho feito

Detalhe, testes e pendências em [FECHO-V1-2026-10-24.md](FECHO-V1-2026-10-24.md).

| Assunto | Estado antes | Agora |
|---|---|---|
| Total do wizard com voucher | Mudar datas mostrava **e gravava** o total sem desconto (ex.: 300 € em vez de 270 €), marcava o preço como editado e o voucher ficava gasto. | O total vem do servidor (mesma função da gravação); respostas antigas descartadas; total desatualizado recusado (409); voucher que deixa de valer pede confirmação. |
| Diálogos de confirmação | Cancelar um diálogo dinâmico deixava a página inerte (wizard sem resposta a cliques). | Corrigido em `ui.js`. |
| Backup/restauro | Só ZIP por organização. | Backup de instância (base, uploads, tokens legados, chave à parte) com verificação e restauro isolado. |
| Google Calendar | Falhas só em log; criação podia duplicar; remoções perdiam-se. | Fila durável, repetição após reinício, IDs determinísticos. |
| Limpezas Google | «Limpar duplicados» apagava sem pré-visualização. | Pré-visualização e confirmação do número. |
| WebKit «Preços» | Intermitente (não explicado). | Causa caracterizada (pointerup atribuído ao contentor logo após o deslocamento automático da faixa; 0/120 com a faixa parada); teste ajustado ao gesto real. Duas corridas de produto encontradas e corrigidas: toque perdido na grelha de preços e rotação com o Calendário a carregar. |
| Rede instável | Repetir após resposta perdida dava «ocupado» (ou duplicava noutra unidade). | Criação de reserva idempotente. |
| Sessão expirada | O rascunho da reserva nova era apagado. | Ecrã limpo, rascunho conservado para o mesmo utilizador. |
| Atualização da PWA | Módulos novos misturados com o núcleo antigo, sem aviso. | Aviso e recarregamento seguro. |
| Dados pessoais | Sem procedimento para hóspedes com pagamentos. | Anonimização (proprietário, pré-visualização). |
| Auditoria / monitorização / uploads | Sem registo geral; sem vista de filas; sem procedimento de órfãos. | `audit_events`, `/api/ops/status`, `uploads-orphans.cjs`. |

## 2. Achados anteriores: segurança, contas e dados

Os códigos S/D abaixo pertencem à revisão de 08/10. Os pontos repetidos são referências ao mesmo trabalho, não problemas adicionais a somar aos 17.

| Origem/assunto | V1 indispensável | Pode ficar para V2 | Estado conhecido |
|---|---|---|---|
| S01/S02/S03 | V1-01/06/17 acima. | — | Revalidados em 23/10. |
| S04: palavra-passe e mudança de email | Limitar tentativas; verificar o novo endereço e proteger/notificar alterações sensíveis, ou não disponibilizar essa alteração até estar segura. | Refinamento visual da gestão da conta. | Pendências da revisão anterior. |
| S04: convites | Tokens protegidos, aceitação atómica e comportamento coerente para contas existentes, se convites estiverem disponíveis. | Onboarding avançado e gestão comercial de várias organizações. | Pendente. |
| S04: propriedade | Impedir promoções irreversíveis ou oferecer um procedimento seguro para transferir/reverter a propriedade. | Interface avançada de administração e múltiplos proprietários. | Pendente. |
| S05: scripts externos/CSP | Restringir a confiança aos recursos necessários e validar o funcionamento das proteções na publicação. | Remover todos os estilos inline e migrar integralmente para uma política sem estilos inline. | Requer fecho técnico. |
| S05: CORS | Confirmar que só as origens previstas são aceites no ambiente publicado. | Tornar a configuração genérica para vários domínios, se a V1 operar num domínio fixo corretamente configurado. | Verificar configuração efetiva. |
| S05: janela OAuth não fecha | Ligação deve terminar com sucesso e mensagem/instrução verdadeira. | Fecho automático da janela e refinamento da transição. | Pendente; não bloqueia se a conclusão manual for clara. |
| S06: fórmulas em CSV | Exportações seguras para texto introduzido por utilizadores; validar XLSX sem presumir a mesma falha. | Novos formatos e personalização dos exports. | Pendente. |
| S07: uploads e OCR | Limites de tamanho/descodificação, acesso privado e proteção contra consumo abusivo, quando ativos. | Otimizações avançadas e novas capacidades de leitura de talões. | Revalidar; recibos privados passaram nos checks HTTP. |
| S07: dados pessoais | Inventário, acessos, retenção e procedimento de eliminação definido, incluindo processadores utilizados. Não adiar o tratamento responsável dos dados. | Painel completo de privacidade e automatização de todos os procedimentos que já possam ser executados com segurança. | Anonimização com pré-visualização implementada (24/10, §1c). Prazos de conservação e inventário de processadores: decisão pendente. |
| D01/D02/D03/D04 | V1-12/13/14/15; estender validação a eventos e hóspedes e preservar partes omitidas do nome. | — | Despesas e classificações reproduzidas; restantes caminhos requerem validação. |
| D05: dia/mês calculado em UTC | Corrigir «hoje», prazos e filtros usados na operação para o fuso acordado. | Preferências avançadas de múltiplos fusos por utilizador. | Pendente. |
| D05: IDs curtos | Garantir que uma colisão não causa gravação incorreta/perda; preferir IDs robustos nas novas gravações durante esta estabilização. | Migração dos identificadores históricos e redesenho das referências visíveis. | Risco identificado por leitura, sem colisão reproduzida. |
| D05: voucher numa reserva expirada não paga | Definir e testar quando se reserva, consome e repõe a utilização, se vouchers públicos estiverem ativos. | Regras promocionais avançadas. | Decisão funcional pendente. |

## 3. Emails e pagamentos: separar fiabilidade de personalização

M/P nesta secção referem-se a 08/10, não aos códigos M da auditoria mobile.

| Origem/assunto | V1 indispensável | Pode ficar para V2 |
|---|---|---|
| M01–M05 | V1-06 a V1-11: segurança, resultado verdadeiro, não duplicação, contexto e elegibilidade corretos. | — |
| M06: remetente e marca | Usar o remetente/organização corretos. | Reformular visualmente todos os emails num novo sistema de marca. |
| M06: traduções | O editor deve indicar o idioma efetivamente enviado. Se a V1 prometer emails traduzidos, a seleção do idioma tem de funcionar. | Tradução automática e suporte multilingue completo, se a V1 assumir explicitamente um idioma suportado. |
| M07: confirmações de pagamento | Comunicar sinal/reserva confirmada/liquidação de forma coerente entre Stripe, histórico e editor; não duplicar notificações. | Novos canais e sequências de comunicação personalizadas. |
| M08: histórico e falhas | Saber o que foi enviado, falhou ou ficou incerto; respeitar templates explicitamente desativados; distinguir erro de inbox vazia; limitar/reagendar tentativas e expor último erro. | Uma inbox visual unificada de todos os canais, filtros avançados e métricas de comunicação. |
| M08: teste Gmail/flag email | Definir claramente a exceção de envio de teste e impedir envios inesperados. | Redesenho da experiência de configuração. |
| Emails em Gmail/iPhone/Outlook/Apple Mail | Texto, links, valores e ações legíveis e utilizáveis nos clientes usados. | Fidelidade perfeita ao creme/terracota, molduras e detalhes de dark mode que não prejudiquem leitura. |
| P01 | V1-05: cotação confirmada pelo operador; identificar o operador no registo. | — |
| P02: reconciliação | Corrigir seleção que pode deixar tentativas novas sem processamento; detetar casos incertos/antigos, aceitação em falta, avisos falhados e reembolsos manuais. Uma lista simples com procedimento seguro serve para V1. | Dashboard financeiro elaborado, gráficos e automatizações adicionais de resolução. |
| P02: consentimento e prazos | Alteração de condições e pagamento manual não podem deixar cobranças/avisos silenciosamente esquecidos. Definir acompanhamento antes/depois do check-in. | Personalização extensiva de regras por segmento ou canal. |
| P03: limites e estados | Unidades/limites monetários compatíveis em todos os caminhos; cancelamentos posteriores ao check-in têm de ter procedimento claro; separar pagamentos Test/Live e validar alterações de hóspede com checkout em curso. | Ferramentas avançadas para disputas e casos excecionais, quando o procedimento básico já resolve a operação. |
| Stripe real | Testar na conta Stripe Test antes de disponibilizar; passagem a Live e eventual cobrança/reembolso de validação em etapa autorizada própria. | Métodos de pagamento e fornecedores adicionais. |

**Decisão importante:** o refinamento das cores de email estava classificado como P0 no backlog antigo. Para o objetivo atual, passa a V2 se o email estiver legível e funcional. A indicação falsa de «enviado» continua a ser V1.

## 4. Operação, arquitetura e manutenção

| Origem/assunto | V1 indispensável | Pode ficar para V2 | Estado conhecido |
|---|---|---|---|
| O01: testes | Regressões dos defeitos corrigidos, checks relevantes na CI e resultados verdes para a versão a publicar. | Expandir a infraestrutura de testes para cenários de escala não exigidos pela operação atual. | Checks específicos, novos testes de 24/10 (wizard/voucher, PWA, restauro, desempenho) na CI local; CI remota por executar. |
| O02: Google Calendar/Tasks | Se usados, alterações/remoções devem persistir como pendentes após falha e ser reconciliáveis; validar migração, limpeza e restauro. | Integrações adicionais e refatoração completa dos conectores. | Tasks com fila de remoções; Calendar com fila durável e IDs determinísticos (24/10, §1c). Validação com conta Google real pendente. |
| Tasks órfãos anteriores | Se afetarem a operação, inventariar e limpar de forma controlada, sem apagar eventos/tarefas legítimos. | Ferramenta de administração sofisticada para limpezas. | Limpezas de duplicados do Calendar e do Tasks passaram a exigir pré-visualização e o número confirmado. Não executadas em contas reais. |
| O03: erros e monitorização | Erros úteis sem segredos; falhas de pagamentos, emails, schedulers e backups visíveis; processo encerra/reinicia com segurança e não perde trabalho em curso. | Telemetria completa, tracing distribuído e dashboards avançados. | `GET /api/ops/status` (filas, falhas, schedulers, disco). Sem alertas automáticos: canal de alertas por decidir. |
| Auditoria sensível | Registar quem alterou permissões, cancelou/reembolsou, restaurou dados ou executou ações sensíveis. | Pesquisa analítica e relatórios de auditoria personalizados. | `audit_events` + `GET /api/ops/audit` (24/10, §1c). Conservação: decisão pendente. |
| O04: backups | Backup completo e restauro isolado de base, uploads, contas/ligações e chave dos tokens; procedimento e limites de recuperação conhecidos. | Gestão visual avançada de backups e infraestrutura de alta disponibilidade. | Backup/restauro de instância implementado; ensaio isolado completo passou e está na CI (24/10, §1c). Ensaio no servidor real por fazer. |
| O04: uploads órfãos | Evitar crescimento sem controlo, falhas por falta de espaço e remoção de ficheiros ainda usados. | Limpeza automática sofisticada; um procedimento controlado pode bastar inicialmente. | Procedimento com listagem e confirmação do número (`scripts/uploads-orphans.cjs`). Volume real não medido. |
| O05: módulos grandes/duplicação | Refatorar apenas o necessário para corrigir de forma consistente as regras de preço, datas, permissões e emails. | Divisão ampla por domínio, componentes, SQL/contextos partilhados, escape comum, helpers de erros, nomes dos handlers e remoção de duplicação sem impacto funcional. | Não exige reescrever o programa para lançar V1. |
| O06: desempenho | Medir com volume representativo da operação, garantir paginação/tempos utilizáveis e não perder dados com concorrência. | Reduzir cada KB, gerar build mínimo de ícones e otimizar para volumes muito superiores aos atuais. | ~7 500 reservas sintéticas: p95 ≤ 20 ms nos pedidos medidos (local). Rede móvel real não medida. |
| Base de dados | Verificar concorrência e recuperação no volume esperado. | Migrar de SQLite ou redesenhar armazenamento sem necessidade demonstrada. | Não há decisão justificada de migração nesta revisão. |
| Containers | Versões reproduzíveis dos componentes usados na publicação, configuração correta e proteção dos segredos/volumes. | Retirar zip/unzip não usados e arrumar o volume legado depois de confirmar que é dispensável. | `node:22-alpine` e `cloudflared:latest` sem versão fixa: fixar antes de publicar. |
| Repositório | Garantir que segredos e dados pessoais não são distribuídos; preservar ficheiros necessários. | Arrumar capturas, pasta `--help/`, duplicação de skills e scripts de teste obsoletos sem impacto operacional. | Não confundir ficheiros supérfluos com exposição de dados. |
| Publicação | Commit/versão identificada, migrações verificadas, checks pós-publicação e forma de regressar à versão anterior. | Automação de entrega mais elaborada. | Lista antes/depois e reversão documentadas; migração e reversão do código verificadas contra o último commit. Deploy não feito. |

## 5. Auditoria mobile: trabalho já feito para a V1

Os códigos M abaixo pertencem a 19/10. Todos são de V1 e estão **corrigidos localmente** segundo a validação registada. Não são 13 tarefas novas pendentes e não confirmam publicação.

| Código | Correção | Classificação/estado |
|---|---|---|
| M01 | Filtros acima da navegação/FAB | V1 — corrigido localmente |
| M02 | Pesquisa e layout dos filtros de despesas | V1 — corrigido localmente |
| M03 | Preços carregam na primeira visita ao alojamento | V1 — corrigido localmente |
| M04 | Separadores deixam de deslocar a página inteira | V1 — corrigido localmente |
| M05 | Proteção de alterações de reservas antes de fechar | V1 — corrigido localmente |
| M06 | Indicação de carregamento em vistas vazias | V1 — corrigido localmente |
| M07 | Mensagens e Vouchers acessíveis pelo menu mobile | V1 — corrigido localmente |
| M08 | Menu acessível em paisagem | V1 — corrigido localmente |
| M09 | Navegação autenticada oculta no login | V1 — corrigido localmente |
| M10 | Alvos de toque e nomes acessíveis nos controlos identificados | V1 — corrigido localmente |
| M11 | Validação de eventos e labels dos formulários revistos | V1 — corrigido localmente |
| M12 | Movimento reduzido respeitado nos efeitos identificados | V1 — corrigido localmente |
| M13 | Calendário customizado dentro do viewport e Escape isolado | V1 — corrigido localmente |

Acessibilidade e dispositivos: os percursos essenciais com toque/teclado, foco, zoom, leitura dos erros e movimento reduzido pertencem à V1. Rede instável, sessão expirada e atualização da PWA estão cobertas em emulação Chromium/WebKit desde 24/10 (§1c); a validação em iPhone/Android reais e com teclado virtual permanece V1 (guião em [Operações](OPERACOES.md#ensaio-em-dispositivos-reais)). Uma revisão abrangente das páginas redesenhadas deve acompanhar a V2; não adia os problemas de acesso aos fluxos atuais.

## 6. Personalização visual: V2

| Observação anterior ou objetivo | Classificação |
|---|---|
| Nova identidade pessoal, tipografia, paleta, ícones e linguagem visual | V2 |
| Reconstrução página a página, com sistema de componentes partilhado | V2 |
| Animações próprias, transições de navegação e microinterações | V2; manter feedback de operação e movimento reduzido na V1 |
| Skeletons elaborados e carregamentos de marca | V2; a V1 já precisa de loading, erro e repetição claros |
| Uniformizar estética de cartões, tabs, títulos e botões | V2, desde que a V1 mantenha orientação, nomes e ações acessíveis |
| Formato visual de euros e separadores | V2 para a apresentação; interpretar, calcular e guardar valores corretamente é V1 |
| «1 hóspedes», mistura de Password/palavra-passe/preview | V2 como revisão editorial; instruções ambíguas em pagamentos/cancelamentos são V1 |
| Botão «+» em páginas de configuração | V2 para a presença/contexto visual; o nome acessível de Nova reserva foi corrigido na V1 |
| Fidelidade visual de emails em dark mode | V2 se leitura e ações estiverem asseguradas |

## 7. Novas funcionalidades do roadmap: V2 ou posterior

São evoluções de produto, não necessariamente «pormenores». Não bloqueiam estabilizar o âmbito existente:

- Integração SIBA/UCFE: a automatização pode ficar para V2; qualquer processo obrigatório aplicável à operação precisa de continuar assegurado por um meio adequado. Este documento não verifica requisitos legais atuais.
- WhatsApp transacional, modelos e caixa partilhada.
- Channel manager/integrações aprovadas com Booking/Airbnb; preços e disponibilidade por canal.
- Motor avançado de preços sazonais/ocupação e recomendações.
- Portal do proprietário, relatórios programados e inbox unificada.
- Integração de faturação/contabilidade através de parceiro; se a operação depender de um processo externo atual, esse processo deve manter-se funcional.
- Links de avaliação pós-estadia, filtros para esconder tarefas concluídas e conveniências semelhantes.
- API pública versionada e aplicação nativa, mediante necessidade demonstrada.

Continuam fora do compromisso de V2: chatbot autónomo sem supervisão, sincronização sem reconciliação, documentos pessoais em canais inadequados e integrações simultâneas com todos os canais. Não passam a aprovados por serem colocados depois da V1.

## 8. Critério de fecho e ordem de trabalho

1. Permissões, contas, exportações e dependências; cabeçalhos de email.
2. Totais/descontos/vouchers, ledger e repetição de pagamentos, estados e cancelamentos.
3. Emails verdadeiros, coerentes e recuperáveis; integrações efetivamente usadas.
4. Preservação e validação de dados, datas e disponibilidade.
5. Restauro completo, regressões na CI, dispositivos e publicação controlada.

A V1 fecha quando os requisitos aplicáveis acima estiverem resolvidos e validados, ou quando uma funcionalidade tiver sido explicitamente retirada do âmbito e existir alternativa operacional. Uma interface mais bonita, uma reestruturação grande ou uma nova integração não são condições para fechar esta fase.

## Fontes e estado

- [Revisão de segurança e fiabilidade de 08/10](REVISAO-2026-10-08.md).
- [Revisão funcional de 23/10](REVISAO-FUNCIONAL-2026-10-23.md).
- [Auditoria mobile](../output/mobile-audit-2026-10-19/RELATORIO.md) e [correções](../output/mobile-audit-2026-10-19/CORRECOES.md).
- [Backlog técnico](MELHORIAS.md) e [roadmap](ROADMAP.md).

Esta classificação orienta o destino V1/V2; os relatórios continuam a ser a fonte da evidência. «Pendente» pode representar defeito reproduzido, risco identificado por leitura, decisão de produto ou validação operacional — não são afirmações equivalentes.
