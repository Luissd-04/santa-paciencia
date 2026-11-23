# Pendentes — melhorias e bugs

Lista viva, iniciada a 23/11/2026 a partir da revisão da app com o dono do produto.
Cada ponto sai daqui quando estiver feito e verificado (o histórico fica no Git).
Os planos anteriores continuam em `ROADMAP.md`, `MELHORIAS.md`, `ESCOPO-V1-V2.md`
e `PLANO-CONSOLA.md`; esta lista será a base do documento único.

## A fazer

1. ✅ **Feito (23/11):** cartão «Portal do hóspede» na reserva (link, envio do email «A sua reserva», WhatsApp, «aberto pelo hóspede»).
2. ✅ **Feito (23/11):** portal do hóspede redesenhado (fases, «concierge» com código e Wi-Fi só da véspera à saída e com a reserva paga).
3. ✅ **Feito (23/11):** política de pagamento em linhas na ficha da reserva.
4. ✅ **Feito (23/11):** «Voltar» da ficha de hóspede regressa à reserva.
5. ✅ **Feito (24/11):** documentos (ficha de reserva, conta corrente, ficha de hóspede, fatura) com dados únicos para PDF e Excel.
6. ✅ **Feito (23/11):** notificações legíveis (botões por baixo do texto).
7. ✅ **Feito (23/11):** «Ver» num grupo do painel abre a lista só com essas reservas (etiqueta removível).
8. ✅ **Feito (23/11):** filtros com várias opções; «Por receber» abre Pendente + Parcial.
9. ✅ **Feito (24/11):** vistas predefinidas por utilizador, computador e telemóvel, e ecrã inicial.
10. ✅ **Feito (23/11):** «Serviços e Taxas» sem scroll horizontal.
11. **Ficha do alojamento (configuração)**
    - a) ✅ **Feito (23/11):** «Emails aos hóspedes» já não abre vazio.
    - b) ✅ **Feito (23/11):** logótipo maior.
    - c) ✅ **Feito (23/11):** ligações em blocos.
    - d) ✅ **Feito (23/11):** pesquisa da morada pelo servidor (`/api/geocode`).
    - e) ✅ **Feito (23/11):** pesquisa das comodidades alinhada.
    - f) ✅ **Feito (23/11):** aviso de ficheiros recusados.
    - g) ✅ **Feito (23/11):** capacidade e preço em blocos.
    - h) ✅ **Feito (23/11):** região retirada do formulário.
12. ✅ **Feito (23/11):** logótipo (organização → alojamento principal → nome) no topo da barra lateral; campo da organização fica para o portal do proprietário.
13. ✅ **Feito (23/11):** animação de recolher fluida.
14. ✅ **Feito (23/11):** saiu o campo de pesquisa do menu lateral no telemóvel.
15. ✅ **Feito (24/11):** recortes da capa por formato, logótipo sem margens, rodar fotografias.
16. **Telemóvel: deslizar para mudar de mês/semana** nos calendários (Calendário: mês e linha do tempo; Eventos: mês e semana). Os botões Anterior/Hoje/Próximo continuam. Em curso (24/11).

17. ✅ **Feito (24/11):** logótipo sem moldura no portal do hóspede e na barra lateral recolhida.

20. **Menu da conta e definições pessoais:** o menu fica com «Definições da conta», «Área do proprietário», «Consola da plataforma» e «Sair». As definições pessoais (perfil, palavra-passe, sessões, aparência, vistas, avisos, menu do telemóvel) saem das Definições do negócio. Em curso (24/11).
21. **Área do proprietário** (só owner): resumo (plano e uso), empresa (NIF, morada, contactos), marca (logótipo e cor da organização), equipa e permissões, plano e faturação (mudança de plano por pedido à plataforma; sem pagamento automático nesta fase), dados e segurança, registo de atividade, transferir propriedade e pedir encerramento. Em curso (24/11).

## Para rever (decisões do dono do produto)

**Portal do hóspede**
- Mapa a sério? Hoje: morada + «Abrir no Google Maps» (implica guardar coordenadas ao pesquisar a morada).
- Campo «Regras da casa» no alojamento, para o portal.
- Email «A sua reserva» fica retido quando faltam dados do alojamento (como os outros). Manter ou enviar sempre?
- Cor do portal = cor do alojamento principal (terracota se não tiver contraste).
- «Próximo passo: pedir o pré-check-in» passou a enviar o email do portal.
- Staff não envia nem gera o link do portal.
- WhatsApp só para telemóveis PT (9…) ou números com indicativo (+…).

**Documentos**
- Não há campo NIF do alojamento/organização (o cabeçalho não o mostra). Acrescentar?
- «Ficha de hóspede» abre uma janela (PDF, Excel, «Abrir ficha») em vez de ir logo para a ficha.
- «aguardar_pagamento» aparece como «Aguarda sinal» (rótulo da app).

**Vistas predefinidas**
- Telemóvel: Eventos só Semana, Calendário só Mês. Pôr Lista/Mês a funcionar no telemóvel?
- Hóspedes continua a abrir em Cartões por omissão.

**Outros**
- Quadrado do logótipo começa centrado (num logótipo largo, as letras do meio).
- Imagem de partilha de links com 1024 px (recomendado 1200 px).
- Número de reservas ao lado de cada opção dos filtros.

**Verificações técnicas**
- `check-browser.cjs` falha no passo «Eventos» (item da barra lateral invisível) — já falhava antes; investigar.
- Aspeto clássico antigo (sem `data-look`) não visto nas notificações e na tabela de serviços.
- Testar em produção: pesquisa da morada, envio real de «A sua reserva», PDFs no telemóvel.

## Forma de trabalhar (pedida pelo utilizador)

- Trabalhar diretamente na **main**: commit e push para `origin main`, um commit por ponto, com mensagem em PT-PT e as linhas de atribuição.
- **Qualquer mudança de UI/UX tem maqueta antes de implementar.** Juntar as maquetas numa página (Artifact HTML), com o antes e o depois de cada ponto, para o utilizador rever tudo de uma vez. A do portal do hóspede é uma maqueta própria e maior, mais tarde.
- Correções sem mudança visual (repor comportamento) avançam sem maqueta.
- **Delegar em agentes:**
  - Haiku: tarefas mecânicas com causa conhecida (11a: um seletor CSS; 14: retirar o botão de pesquisa do menu);
  - Sonnet: correções com causa identificada e âmbito fechado (4, 7, 11d, e as de UI depois de aprovadas);
  - eu (modelo principal): maquetas, portal, revisão de cada diff e verificação no browser (Playwright, capturas no computador e no telemóvel).
- Cada agente recebe: o ponto da lista, a causa, os ficheiros, o critério de conclusão e «não fazer commit». Eu reviso, testo e faço o commit.

## Para mais tarde
- **Condições gerais da reserva (ponto 18, à espera da opinião do cliente):** documento formal versionado com PDF, aceite antes de pagar; privacidade como «tomei conhecimento» com versão; marketing opcional. Maqueta pronta (separador «Condições gerais e privacidade» das maquetas).
- **Documentos e aceitações do hóspede (ponto 19, adiado):** política de privacidade completa (art. 13.º); regras da casa aceites no pré-check-in; Livro de Reclamações Eletrónico e entidade de resolução alternativa de litígios no site, portal e emails; secção «Documentos» no portal (condições, privacidade, regras, fatura). Validar textos com jurista.
- **Portal do proprietário:** campos da marca do cliente nas Definições (nome, logótipo grande e pequeno, cor). Ver o ponto 12.

- Juntar num único documento os planos espalhados por: docs/ROADMAP.md, docs/MELHORIAS.md, docs/ESCOPO-V1-V2.md, docs/FECHO-V1-2026-10-24.md, docs/PERCURSO-HOSPEDE-2026-11-19.md, docs/PLANO-CONSOLA.md.
- Línguas nos emails: esconder o seletor ou escolher a língua pelo país do hóspede.
