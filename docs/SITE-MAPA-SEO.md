# Site público: mapa de páginas e palavras-chave

Versão para aprovação · 15 de novembro de 2026. Segue `docs/MARKETING-LANDING.md`.

## 0. Decisões tomadas

| Tema | Decisão |
|---|---|
| Domínio | `santapaciencia.xyz`, só para testes. A app não muda de endereço agora |
| Marca | «Santa Paciência» é provisória: a plataforma terá outro nome e outro domínio |
| Tecnologia | Astro (HTML estático), na pasta `site/` do repositório |
| Idiomas | Português na raiz e inglês em `/en/`, com endereços traduzidos |
| Conversão | «Pedir acesso antecipado»: o pedido entra na consola como lead e é ativado por convite. Sem registo aberto |
| Preços | Não são publicados nesta fase |
| Guias | Escritos pelo departamento de marketing. O site fornece a estrutura e um editor visual |
| Identidade | A da app (terracota, creme, Playfair Display), em versão editorial, com fotografia real e capturas da app |

## 1. Princípios que decorrem destas decisões

1. **A marca é configurável.** Nome, domínio, logótipo, email de contacto e redes sociais ficam num único ficheiro (`site/src/config/brand.ts`). Os textos usam essa variável. Mudar de nome passa por editar esse ficheiro e rever os textos, e não por reescrever o site.
2. **Não indexar enquanto a marca e o domínio forem provisórios.** O site fica com `noindex` e o `robots.txt` bloqueado até ao nome final, por três razões:
   - a autoridade ganha no Google por `santapaciencia.xyz` perde-se com a mudança de domínio;
   - o nome é o da primeira cliente, e aparecer nas pesquisas por «Santa Paciência» competiria com o site dela (`santapaciencia.pt`);
   - um rebranding obrigaria a redirecionar e a reindexar tudo.

   Todo o SEO técnico fica feito e verificado, desligado por um único interruptor (`INDEXAR=false`). No domínio definitivo basta ligá-lo e submeter o sitemap.
3. **As palavras-chave são genéricas, nunca da marca.** Este mapa continua válido com qualquer nome.
4. **Não prometer o que o produto não faz.** Ver a secção 6.

## 2. Estrutura de endereços

```
/                                   /en/
/funcionalidades/                   /en/features/
/funcionalidades/<slug>/            /en/features/<slug>/
/para/<perfil>/                     /en/for/<profile>/
/ferramentas/calculadora-tempo/     /en/tools/time-calculator/
/guias/                             /en/guides/
/guias/<slug>/                      /en/guides/<slug>/
/acesso-antecipado/                 /en/early-access/
/sobre/  /contacto/                 /en/about/  /en/contact/
/privacidade/ /termos/              /en/privacy/ /en/terms/
```

Cada página PT aponta para a sua equivalente EN (e vice-versa) com `hreflang="pt-PT"`, `hreflang="en"` e `x-default` para a PT. O seletor de idioma leva sempre à página equivalente, e não ao início.

## 3. Mapa de páginas e palavras-chave

Prioridade: **A** = construir na primeira fase com texto completo; **B** = primeira fase, com texto mais curto; **C** = fase seguinte. Intenção: **T** = comercial ou transacional («quero uma ferramenta»), **I** = informativa.

Não temos acesso a volumes de pesquisa reais. A prioridade baseia-se na intenção e na concorrência que se vê nos resultados do Google. Os volumes devem ser confirmados no Google Keyword Planner (grátis com uma conta Google Ads) antes do lançamento definitivo e, depois, com os dados reais do Search Console.

### 3.1 Páginas principais

| Página | PT: pesquisa principal · secundárias | EN: pesquisa principal · secundárias | Int. | Prio. |
|---|---|---|---|---|
| Início | software gestão alojamento local · programa para alojamento local, plataforma gestão AL | vacation rental software Portugal · short-term rental management software, holiday let software | T | A |
| Funcionalidades (índice) | funcionalidades software alojamento local | vacation rental software features | T | A |
| Acesso antecipado | — (página de conversão, sem SEO) | — | T | A |
| Calculadora de tempo | quanto tempo demora gerir alojamento local · calculadora alojamento local | vacation rental time calculator · how much time does it take to manage an airbnb | I | B |
| Sobre | — | — | — | B |
| Contacto | — | — | — | B |

### 3.2 Funcionalidades (`/funcionalidades/<slug>/`)

| Slug PT / EN | PT: pesquisa principal · secundárias | EN: pesquisa principal · secundárias | Prio. |
|---|---|---|---|
| `calendario` / `calendar` | calendário alojamento local · sincronizar calendário airbnb booking, evitar reservas duplicadas | vacation rental calendar sync · sync airbnb and booking.com calendar, avoid double bookings | A |
| `reservas-diretas` / `direct-bookings` | reservas diretas alojamento local · motor de reservas alojamento local, site de reservas próprio | direct booking engine vacation rental · direct bookings without commission | A |
| `pagamentos-online` / `online-payments` | pagamentos online alojamento local · cobrar sinal reserva, pagamento antecipado hóspedes | vacation rental online payments · collect deposit from guests | A |
| `mensagens-automaticas` / `guest-messaging` | mensagens automáticas hóspedes · email automático airbnb, mensagens check-in alojamento local | automated guest messaging · automatic check-in instructions email | A |
| `pre-check-in` / `online-check-in` | check-in online alojamento local · pré-check-in hóspedes, recolha dados hóspedes SIBA | online check-in vacation rental · guest registration form Portugal | A |
| `despesas` / `expenses` | gestão de despesas alojamento local · registar despesas AL, digitalizar talões | vacation rental expense tracking · receipt scanning for hosts | A |
| `equipa-e-tarefas` / `team-and-tasks` | gestão de limpezas alojamento local · tarefas equipa limpeza AL | vacation rental cleaning schedule · housekeeping task management | A |
| `relatorios` / `reports` | relatórios alojamento local · rentabilidade alojamento local, ocupação por alojamento | vacation rental reporting · occupancy and revenue reports | B |
| `vouchers` / `vouchers` | vouchers alojamento local · códigos de desconto reservas diretas | vacation rental discount codes · gift vouchers for stays | B |
| `app-telemovel` / `mobile-app` | app gestão alojamento local · gerir alojamento local no telemóvel | vacation rental management app · manage rentals from phone | B |

### 3.3 Para quem (`/para/<perfil>/`)

| Slug PT / EN | PT: pesquisa principal | EN: pesquisa principal | Prio. |
|---|---|---|---|
| `proprietarios` / `owners` | como gerir alojamento local sozinho · gerir 1 alojamento local | how to manage a holiday rental yourself | A |
| `gestores` / `property-managers` | software para gestores de alojamento local · gerir vários alojamentos locais | software for vacation rental managers | A |
| `empresas-de-gestao` / `management-companies` | software empresa gestão alojamento local · plataforma para empresas de AL | property management company software Portugal | B |

### 3.4 Guias (escritos pelo marketing)

O site traz a estrutura pronta: listagem com filtro por categoria, página de artigo com autor, data de publicação e de revisão, índice, perguntas frequentes no fim, ligações automáticas para as funcionalidades relacionadas e dados estruturados `Article`. Os temas abaixo estão ordenados pela oportunidade. Os temas legais devem ser revistos por quem acompanha a legislação (mudou bastante em 2025–2026).

| # | Tema PT · pesquisa | Tema EN · pesquisa | Liga a |
|---|---|---|---|
| 1 | Seguro obrigatório do alojamento local · seguro alojamento local obrigatório | Mandatory insurance for holiday rentals in Portugal | Despesas |
| 2 | Comunicação de hóspedes no SIBA, passo a passo · comunicar hóspedes SIBA | How to register guests with SIBA | Pré-check-in |
| 3 | Taxa turística: como cobrar e entregar · taxa turística alojamento local | Tourist tax for holiday rentals in Portugal | Relatórios |
| 4 | Cancelamento de registos de AL em 2026: o que fazer · registo alojamento local cancelado | AL licence cancellations in 2026 | Início |
| 5 | Como evitar reservas duplicadas no Airbnb e no Booking · reserva duplicada airbnb booking | How to avoid double bookings | Calendário |
| 6 | Modelos de mensagens para hóspedes · mensagem boas vindas hóspedes | Guest message templates | Mensagens |
| 7 | IRS do alojamento local: regime simplificado ou contabilidade organizada · irs alojamento local | Taxes on holiday rental income in Portugal | Despesas |
| 8 | Que despesas pode deduzir no AL · despesas dedutíveis alojamento local | Deductible expenses for holiday lets | Despesas |
| 9 | Como ter reservas diretas e pagar menos comissões · reservas diretas sem comissões | How to get direct bookings | Reservas diretas |
| 10 | Checklist de limpeza do alojamento local · checklist limpeza alojamento local | Cleaning checklist for holiday rentals | Equipa |
| 11 | Como abrir um alojamento local em 2026 · como abrir alojamento local | How to open a holiday rental in Portugal | Início |
| 12 | Quanto rende um alojamento local · rentabilidade alojamento local | Is a holiday rental profitable in Portugal | Calculadora |

### 3.5 Fase seguinte (C)

- Comparações: «alternativa ao Hostkit», «Smoobu vs …», «Excel vs software», a escrever com honestidade.
- Páginas de taxa turística por concelho, geradas a partir de uma tabela de dados mantida pelo marketing.
- Centro de ajuda público, a partir da documentação interna.
- Página de preços, quando houver.

## 4. Títulos e descrições

`{marca}` é substituído pelo nome configurado. Títulos com até ~60 caracteres e descrições com até ~155.

| Página | Título PT | Descrição PT |
|---|---|---|
| Início | Software de gestão para alojamento local · {marca} | Reservas, calendário do Airbnb e do Booking, pagamentos, hóspedes, despesas e equipa num só lugar. Feito em Portugal para o alojamento local. |
| Funcionalidades | Funcionalidades para gerir alojamento local · {marca} | Calendário sincronizado, reservas diretas, pagamentos online, mensagens automáticas, pré-check-in, despesas e tarefas da equipa. |
| Calendário | Calendário para alojamento local: Airbnb e Booking · {marca} | Veja todas as reservas do Airbnb, do Booking.com e diretas num só calendário, por alojamento, e reduza o risco de reservas sobrepostas. |
| Reservas diretas | Reservas diretas para alojamento local · {marca} | A sua própria página de reservas, com disponibilidade real, regras de estadia e pagamento online. Menos dependência das plataformas. |
| Pagamentos online | Pagamentos online para alojamento local · {marca} | Cobre um sinal ou o valor total com o Stripe. Cada pagamento fica associado à reserva, sem transferências por confirmar. |
| Mensagens | Mensagens automáticas para hóspedes · {marca} | Confirmação, instruções de chegada e despedida enviadas pelo seu Gmail à hora certa, em 7 idiomas. |
| Pré-check-in | Check-in online para alojamento local · {marca} | O hóspede preenche os dados e os dos acompanhantes antes de chegar, incluindo os campos pedidos pelo SIBA. |
| Despesas | Gestão de despesas para alojamento local · {marca} | Fotografe o talão e a despesa é preenchida automaticamente: fornecedor, data, valor e IVA, associada ao alojamento certo. |
| Equipa e tarefas | Gestão de limpezas e equipa no alojamento local · {marca} | Limpezas e manutenção com responsável e prazo, também no Google Tasks. Cada pessoa vê só o que lhe compete. |
| Relatórios | Relatórios de ocupação e rentabilidade do AL · {marca} | Ocupação, receitas por canal e despesas por alojamento, sem montar folhas de cálculo. |
| Vouchers | Vouchers e códigos de desconto para AL · {marca} | Crie vouchers de valor, de percentagem ou de noites para as reservas diretas, com regras e validade. |
| App | App para gerir alojamento local no telemóvel · {marca} | Instale no ecrã inicial e receba avisos de reservas, pagamentos e tarefas. Funciona em qualquer telemóvel. |
| Proprietários | Gerir alojamento local sozinho, sem stress · {marca} | Para quem tem um a três alojamentos e quer deixar o Excel e o WhatsApp sem perder o controlo. |
| Gestores | Software para gestores de alojamento local · {marca} | Vários alojamentos, uma equipa, um só sítio: calendário, tarefas, permissões e relatórios por casa. |
| Acesso antecipado | Peça acesso antecipado · {marca} | Estamos a abrir a plataforma a um grupo pequeno de anfitriões. Deixe os seus dados e falamos consigo. |

| Page | EN title | EN description |
|---|---|---|
| Home | Vacation rental software made in Portugal · {marca} | Bookings, Airbnb and Booking.com calendar sync, payments, guests, expenses and your team in one place. Built for Portuguese holiday rentals. |
| Calendar | Vacation rental calendar sync: Airbnb & Booking · {marca} | See every Airbnb, Booking.com and direct booking in one calendar per property, and reduce the risk of double bookings. |
| Direct bookings | Direct booking engine for holiday rentals · {marca} | Your own booking page with live availability, stay rules and online payment. Rely less on the big platforms. |
| Messaging | Automated guest messaging · {marca} | Confirmations, check-in instructions and goodbyes sent from your Gmail at the right time, in 7 languages. |
| Online check-in | Online check-in for holiday rentals in Portugal · {marca} | Guests fill in their details and their companions' before arrival, including the fields SIBA requires. |
| Expenses | Expense tracking for vacation rentals · {marca} | Snap a receipt and the expense fills itself: supplier, date, amount and VAT, linked to the right property. |
| Early access | Request early access · {marca} | We are opening the platform to a small group of hosts. Leave your details and we will get in touch. |

As restantes páginas EN seguem o mesmo padrão, e a tradução final é escrita na construção.

## 5. SEO técnico (fica feito, mesmo com a indexação desligada)

- HTML completo gerado no build. O conteúdo não depende de JavaScript.
- Em cada página: `<title>`, descrição, `canonical`, `hreflang`, Open Graph e Twitter Card, com imagem de partilha gerada por página (1200×630, título + marca).
- Dados estruturados:
  - **Todas:** `Organization`, `WebSite` e `BreadcrumbList`.
  - **Início e funcionalidades:** `SoftwareApplication` (categoria `BusinessApplication`, sem `offers` enquanto não houver preços).
  - **Páginas com perguntas:** `FAQPage`.
  - **Guias:** `Article`, com autor e datas.
- `sitemap.xml` com as alternativas de idioma e `robots.txt`. Ambos mudam conforme `INDEXAR`.
- Página 404 nos dois idiomas. Endereços sempre com `/` final e minúsculas.
- Desempenho:
  - imagens AVIF/WebP com `srcset`;
  - fontes servidas pelo próprio site, só nos pesos usados;
  - JavaScript apenas em ilhas: formulário, calculadora, separadores;
  - animações em CSS, desligadas com `prefers-reduced-motion`.
  - Objetivo: Lighthouse ≥ 95 em todas as categorias.
- Acessibilidade: contraste AA, navegação por teclado, textos alternativos e `lang` correto.
- Estatísticas sem cookies (Plausible ou Umami, alojado por nós), para não precisar de banner de cookies.
- Ligações internas:
  - cada funcionalidade liga a 3 outras e aos guias da mesma categoria;
  - cada guia liga a 1 ou 2 funcionalidades;
  - o rodapé lista todas as funcionalidades.

## 6. O que o texto pode e não pode afirmar

Verificado no código a 15/11/2026.

| Afirmação | Pode? | Nota |
|---|---|---|
| Sincroniza calendários do Airbnb e do Booking.com | **Não** | Revisto a 25/11/2026: os endereços iCal ficam guardados no alojamento, mas nada os importa nem exporta. As reservas dessas plataformas são registadas à mão, com o canal identificado |
| Pagamentos online com Stripe, sinal ou total | Sim | |
| Mensagens automáticas pelo Gmail, em 7 idiomas | Sim | Modelos em PT, EN, FR, ES, DE, IT e NL |
| Pré-check-in recolhe os campos do SIBA | Sim | **Não** dizer que comunica ao SIBA automaticamente: a submissão não existe |
| Leitura de talões com IA | Sim | Opcional, depende da chave da API |
| Taxa turística | Parcial | Calculada nas reservas e relatórios. Não dizer que é entregue à câmara |
| Faturação certificada, Modelo 30, INE | **Não** | Não existem |
| Google Calendar, Gmail, Google Tasks | Sim | |
| App instalável e notificações | Sim | PWA. Não dizer «disponível na App Store» |
| Reservas protegidas contra bots | Sim | Turnstile |

**Para o produto:** os concorrentes portugueses (Hostkit, Ynnov, Cloudbeds) vendem-se sobretudo pelas obrigações legais: submissão ao SIBA, faturação certificada, Modelo 30, INE e taxa turística. É a maior lacuna face a eles e, se for implementada, também a melhor mensagem de marketing.

## 7. Acesso antecipado: o fluxo

1. O formulário pede nome, email, telefone (opcional), número de alojamentos, concelho, ferramenta atual, como nos conheceu e consentimento RGPD, e é protegido por Turnstile.
2. O site envia o pedido para um novo endpoint público `POST /api/public/early-access`, com limite de pedidos, na mesma API.
3. O pedido cria uma lead (tipo «Potenciais clientes», estado «Novo») em `platform_records`, com a origem (página, idioma e UTM), e uma tarefa de seguimento para o departamento comercial.
4. O pedido recebe um email de confirmação no idioma em que foi feito.
5. Na consola, a lead passa a teste privado (`platform_trial_access`) com o convite que já existe.

O site estático é servido pelo mesmo Express, num caminho próprio, sem tocar na app. Opções a decidir:
- `santapaciencia.xyz/site/` para apresentações, com `noindex`;
- ou um subdomínio `site.santapaciencia.xyz`, que exige DNS e certificado.

## 8. Para aprovar

1. A regra de **não indexar até haver nome e domínio definitivos** (secção 1.2).
2. As páginas A e B das secções 3.1 a 3.3, e os temas dos guias a entregar ao marketing (3.4).
3. Os títulos e as descrições (secção 4).
4. Onde fica o site nesta fase: `/site/` ou `site.` (secção 7).
5. Como avançar com as maquetas: refazer o **Início** e a página de **Calendário** em PT e EN, com conteúdo completo e capturas reais da app.
