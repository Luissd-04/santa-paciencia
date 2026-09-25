# Melhorias técnicas

Backlog técnico confirmado em 20 de setembro de 2026. Este documento contém
trabalho de engenharia; funcionalidades e integrações pertencem ao
[roadmap de produto](ROADMAP.md).

## P0 — antes da próxima publicação

### Validar a correção de Google Tasks em produção

Critérios de conclusão:

- migração `google_task_cleanup_queue` aplicada;
- eliminação de reserva remove tarefas relacionadas, incluindo concluídas;
- falha temporária deixa a operação pendente e uma execução posterior conclui;
- estado da integração mostra `cleanup_pending` coerente;
- limpeza dos órfãos anteriores é feita com pré-visualização e registo.

### Confirmar recuperação de dados

Critérios de conclusão:

- backup automatizado de base de dados e uploads;
- chave de tokens guardada separadamente e acessível a responsáveis definidos;
- restauro ensaiado num ambiente isolado;
- tempos de recuperação e perda máxima aceitável registados.

## P1 — fiabilidade e segurança operacional

### Observabilidade estruturada

Substituir logs dispersos por eventos estruturados com nível, pedido,
organização, integração e duração, sem dados pessoais desnecessários. Criar
alertas para falhas repetidas, filas antigas, schedulers inativos e falta de
espaço.

Conclusão: uma falha de email, Tasks ou reserva pública pode ser localizada por
correlation ID sem expor tokens, documentos ou conteúdo sensível.

### Auditoria de ações sensíveis

Registar alterações de papéis, acessos a documentos, importação/restauro,
alterações de configurações e operações manuais sobre integrações. Definir
retenção, acesso e exportação desses registos.

### Testes de fluxos completos

Acrescentar cenários de integração para CRUD de reservas, pagamentos,
pré-check-in, isolamento entre organizações, reautorização OAuth e repetição dos
schedulers. Manter os testes de regressão de segurança já existentes.

### Cadeia de fornecimento e containers

Fixar a versão ou digest da imagem `cloudflare/cloudflared`, rever imagens base e
automatizar atualizações controladas. Gerar inventário de dependências e manter
as auditorias atuais na CI.

### Privacidade e retenção

Inventariar dados pessoais, justificar prazos de retenção e automatizar
eliminação/anonimização onde aplicável. Rever exports, logs, uploads e backups.

## P2 — manutenção e experiência

### Modularizar ficheiros grandes

Continuar a divisão por funcionalidade. Os principais candidatos atuais são
`frontend/js/eventos.js`, `despesas.js`, `auth.js`, `precos.js` e as folhas CSS
de operações/reservas. Cada extração deve manter comportamento, reduzir estado
global e ganhar testes específicos.

### Endurecer a CSP

Remover gradualmente estilos inline para eliminar `'unsafe-inline'` de
`style-src`. Avaliar alojar localmente recursos críticos hoje carregados por CDN
e definir um processo explícito para atualizar versões e integridade.

### Acessibilidade e dispositivos reais

Executar auditoria WCAG nos fluxos de reserva, calendário, modais, tabelas e
pré-check-in. Validar teclado, leitor de ecrã, contraste, zoom e telemóveis iOS e
Android reais, incluindo instalação/atualização da PWA.

### Desempenho e carga

Manter o orçamento automatizado do frontend e acrescentar medições de API com
volumes realistas. Rever índices e paginação quando a base crescer. Definir o
ponto em que SQLite deixa de cumprir concorrência, disponibilidade ou escala.

### Qualidade de email

Testar renderização em Gmail, Outlook e Apple Mail, versões mobile e dark mode.
Adicionar monitorização de rejeições e falhas permanentes antes de aumentar a
automação.

## Regra de manutenção

Uma melhoria só passa a concluída quando o comportamento estiver validado e a
documentação relevante tiver sido atualizada. Itens concluídos devem sair deste
ficheiro; o histórico pertence ao Git e às notas de versão, não a um backlog
permanente.
