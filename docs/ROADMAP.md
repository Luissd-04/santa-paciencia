# Roadmap de produto

Roadmap vivo, revisto no repositório em 26 de setembro de 2026. A revisão local
não confirma o estado da publicação nem das validações em produção. As datas serão atribuídas
quando houver capacidade e acesso confirmado às plataformas externas.

## Critérios de prioridade

1. Conformidade legal e proteção de dados.
2. Fiabilidade da operação diária e prevenção de reservas duplicadas.
3. Redução de trabalho manual repetitivo.
4. Experiência do hóspede e crescimento de receita.

Cada integração nova deve ter fila durável, idempotência, auditoria, repetição
com limites, estado visível e reconciliação. Uma chamada externa bem-sucedida não
é, por si só, prova de sincronização permanente.

## Agora — estabilizar a base

- Validar a correção das cores dos emails no Gmail para iPhone, numa conta
  Google, em modo claro e escuro. O problema observado altera o creme para
  castanho-escuro e o terracota para salmão. Há uma correção local preparada;
  só fechar após publicação e teste de uma mensagem nova no dispositivo.
  Ver [diagnóstico e critérios de validação](EMAIL-GMAIL.md).
- Confirmar a publicação da correção de remoção de Google Tasks, que já existe
  no código com testes, e confirmar que a migração
  `google_task_cleanup_queue` foi aplicada.
- Verificar em produção o ciclo: criar reserva, gerar tarefas, eliminar reserva,
  remover tarefas remotas e esvaziar a fila de limpeza.
- Fazer uma limpeza controlada dos possíveis Google Tasks órfãos criados antes
  da correção. Esses órfãos já não podem ser associados com segurança apenas a
  partir da base de dados atual; a operação precisa de pré-visualização e
  confirmação humana.
- Validar backups e um restauro completo, incluindo uploads e chave dos tokens.
- Concluir testes manuais de email real, pré-check-in e reserva pública em
  telemóvel.

## Seguinte — SIBA/UCFE

Primeira integração estratégica recomendada por ter valor de conformidade.

Objetivo: enviar os boletins de alojamento de cidadãos estrangeiros ao sistema
SIBA/UCFE através do Web Service oficial. A orientação oficial atual indica três
dias úteis tanto para a entrada como para a saída.

Âmbito inicial:

- registo das credenciais do estabelecimento e separação entre teste/produção;
- validação dos dados obrigatórios no pré-check-in;
- geração do XML no formato oficial e validação pelo respetivo XSD;
- envio de chegada e saída, com fila durável e repetição segura;
- armazenamento de estado, referência/recibo e erro legível para o operador;
- ecrã de pendentes, rejeitados e enviados, com reenvio controlado;
- política de retenção, acesso e eliminação para dados de identificação.

Antes da implementação é necessário obter a documentação e credenciais atuais do
serviço, confirmar os prazos legais com fonte oficial e mapear todos os campos.
A integração deve ser tratada como comunicação sensível, não como simples
exportação de hóspedes.

## Seguinte — WhatsApp transacional

Começar pela WhatsApp Business Platform, diretamente ou através de um fornecedor
oficial, com mensagens estritamente operacionais:

- confirmação e alteração do estado da reserva;
- lembrete de pré-check-in e pagamento;
- instruções de chegada e código de acesso apenas quando as condições internas
  estiverem cumpridas;
- boas-vindas e lembrete de checkout.

O desenho deve incluir consentimento, modelos aprovados, preferências por
hóspede, webhook de entrega/leitura/falha, custos e fallback para email. Não enviar
documentos de identificação pelo WhatsApp.

Uma segunda fase pode acrescentar caixa de entrada partilhada, atribuição a
membros da equipa, histórico na reserva e respostas rápidas. Automação com IA só
depois de existir escalamento humano, limites claros e revisão de privacidade.

## Depois — canais de venda e preços

Objetivo: ultrapassar o iCalendar e sincronizar reservas, disponibilidade,
preços e restrições.

Modelo recomendado:

- Santa Paciência como fonte de verdade de preços, disponibilidade e restrições;
- reservas e alterações recebidas dos canais;
- inventário, preços e regras enviados para cada canal;
- mapeamento explícito de alojamentos e planos tarifários;
- suporte para markup por canal, ocupação, estadia mínima, stop-sell, CTA/CTD,
  impostos e moeda;
- webhooks, sincronização incremental e reconciliação periódica completa;
- painel com divergências e possibilidade de repetição segura.

O primeiro passo prático deve ser uma prova de conceito com um channel manager
ou agregador aprovado que já tenha acesso a Booking.com e Airbnb. A integração
direta com Booking.com depende normalmente do programa de Connectivity Partner;
o acesso direto à API Airbnb é ainda mais restrito e sujeito a parceria,
aprovação e requisitos funcionais. Só compensa investir em certificação direta
quando o número de propriedades e o volume justificarem o custo operacional.

## Mais tarde

- motor de preços com regras sazonais, ocupação e recomendações auditáveis;
- portal do proprietário e relatórios programados;
- contabilidade/faturação certificada através de parceiro adequado;
- inbox unificada de email, WhatsApp e canais;
- API pública versionada para integrações autorizadas;
- aplicação móvel nativa apenas se a PWA não cobrir necessidades comprovadas.

## Fora do âmbito imediato

- chatbot autónomo a responder sem supervisão;
- sincronização bidirecional sem logs ou reconciliação;
- armazenamento de cópias de documentos em canais de mensagens;
- integração direta com todos os canais antes de validar um agregador;
- funcionalidades novas que não tenham dono operacional e métricas de sucesso.

## Referências oficiais

- [SIBA — modos de envio e Web Services](https://siba.ssi.gov.pt/ajuda/modos-de-envio/)
- [SIBA — prazos e perguntas frequentes](https://siba.ssi.gov.pt/ajuda/perguntas-frequentes/)
- [Meta — WhatsApp Business Platform Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/overview)
- [Meta — coleção oficial da WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
- [Booking.com — Connectivity APIs](https://developers.booking.com/connectivity/docs)
- [Booking.com — Rates & Availability API](https://developers.booking.com/connectivity/docs/ari)
- [Airbnb — API Terms](https://www.airbnb.com/help/article/3418)

Estas fontes devem ser revistas antes de fechar âmbito ou datas, porque os
programas de parceiros, requisitos técnicos, preços e regras podem mudar.
