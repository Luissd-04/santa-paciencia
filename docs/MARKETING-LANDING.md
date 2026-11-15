# Landing page e captação de clientes

Pesquisa de 15 de novembro de 2026. As maquetas estão no canvas «Landing Santa Paciência»: desktop, telemóvel e uma página de funcionalidade para SEO.

## 1. Mercado

- O RNAL tinha cerca de 119 mil AL ativos em junho de 2026. A ALEP estima que o total desça para ~90 mil depois da limpeza dos registos inativos ou sem seguro. Os municípios já cancelaram mais de 10 mil.
- Mais de 47 mil registos estão em nome de empresas, e mais de dois terços concentram-se em Faro, Lisboa e Porto.
- Concorrentes que aparecem nas pesquisas em português: Hostkit (forte em obrigações legais: SIBA, INE, taxa turística, faturação), Avantio, Smoobu (desde ~29 €/mês), Lodgify, Amenitiz, Guesty e Hostaway.
- Público-alvo: proprietários com 1 a 10 unidades que hoje usam Excel e WhatsApp, e pequenas empresas de gestão com equipa de limpeza.

## 2. O que funciona numa landing page (aplicado nas maquetas)

Estrutura recomendada: navegação mínima → hero → prova social → problema → como funciona → funcionalidades → prova social detalhada → preços → FAQ → CTA final. A mediana de conversão das landing pages de SaaS ronda os 3,8% (Unbounce), e as 10% melhores passam os 11%.

| Regra | Como está nas maquetas |
|---|---|
| Uma promessa clara acima da dobra | «Gerir alojamento local não devia exigir santa paciência.» |
| Um único objetivo e um CTA principal repetido | «Experimentar grátis» no topo, na calculadora, nos preços e no fim |
| Mostrar o produto em vez de o descrever | Janela da app com o calendário a preencher-se e notificações reais |
| A animação tem de explicar algo | Barras de reservas, leitura do talão, mensagens a serem escritas |
| Começar pela dor | Secção «Uma reserva. Sete sítios diferentes.», antes e depois |
| Ferramenta interativa que capta contactos | Calculadora de horas recuperadas |
| Reduzir o risco | Experiência grátis, FAQ, apoio em português |
| Velocidade | Cada segundo extra de carregamento custa ~7% da conversão |

Animações usadas:
- Entrada do hero em 3D, barras de reservas a crescer em sequência e contador animado (`@property`).
- Notificações em rotação, cartão a flutuar, ponto de «novo» a pulsar e palavra rotativa no título.
- Faixa de integrações em loop, que pára quando se passa o rato.
- Revelação ao fazer scroll, linha de passos a desenhar-se e barra de progresso. Tudo isto usa CSS Scroll-driven Animations, sem JavaScript e com fallback.
- Micro-interações: brilho no CTA, seta que avança, cartões que sobem, sublinhado dos links, separadores e acordeão.
- Tudo é desligado com `prefers-reduced-motion`. Animar só as secções grandes, porque animar todos os elementos pesa nos telemóveis antigos.

## 3. Por preencher antes de publicar

`[PREÇO]`, `[N] dias grátis`, `[X]%` de desconto anual, «sem cartão de crédito», «sem comissões», migração de dados e formatos de exportação. Os testemunhos têm de ser reais e ter autorização dos clientes. Não inventar números.

## 4. SEO

- Site público separado da app (por exemplo `santapaciencia.pt`, com a app em `app.`), com `robots.txt`, `sitemap.xml`, título e descrição em cada página e dados estruturados `SoftwareApplication`, `FAQPage` e `Organization`.
- Uma página por funcionalidade e por intenção de pesquisa (o modelo está no canvas): «calendário alojamento local», «software gestão alojamento local», «mensagens automáticas airbnb», «pré-check-in online», «gestão de despesas alojamento local», «reservas diretas sem comissões».
- Guias com intenção de pesquisa e pouca concorrência em PT-PT: seguro obrigatório de AL, comunicação de hóspedes no SIBA, taxa turística por concelho, IRS do AL, como evitar reservas sobrepostas e modelos de mensagens para hóspedes.
- Páginas de comparação («alternativa ao Hostkit», «Smoobu vs Santa Paciência»), honestas.
- Google Search Console, perfil Google Business e Livro de Reclamações Eletrónico no rodapé.

## 5. Captação de clientes

1. **Indicações.** São o canal mais barato: conversão de 10 a 30%, contra 2 a 5% no tráfego pago. Oferecer um mês grátis a quem indica e a quem é indicado.
2. **Ferramentas grátis em troca do email.** A calculadora de horas, um gerador de mensagens para hóspedes e uma lista de obrigações legais do AL.
3. **Parcerias.** Contabilistas, empresas de limpeza e lavandaria, mediadores de seguros de AL, a ALEP e as associações regionais. Webinars em conjunto.
4. **Diretórios.** Capterra, GetApp e G2, onde os concorrentes têm centenas de avaliações. Pedir avaliações aos primeiros clientes.
5. **Comunidades.** Grupos de Facebook de anfitriões portugueses e fóruns de AL. Responder a dúvidas antes de vender.
6. **Contacto direto.** Dados públicos do RNAL por concelho, com prioridade aos titulares com 2 a 10 unidades em Lisboa, Porto e Algarve. Cumprir o RGPD: contacto B2B relevante, opção de sair e sem compra de listas.
7. **Google Ads** nos termos de nicho, enquanto o SEO amadurece (6 a 12 meses), com envio para as páginas de funcionalidade e não para a página inicial.
8. **Momentos do setor.** A limpeza do RNAL e o seguro obrigatório em 2026 levam muitos proprietários a profissionalizar-se. Escrever conteúdo e campanhas sobre isso.
9. **Medir.** Custo de aquisição abaixo do valor do cliente ao longo da vida, conversão por página e origem dos registos (UTM).

## Fontes

- [SaaSFrame: tendências de landing pages em 2026](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
- [Line25: tendências de web design em 2026](https://line25.com/articles/web-design-trends-2026/)
- [SaaS Hero: guia de otimização](https://www.saashero.net/competitor/saas-landing-page-optimization-guide/)
- [involve.me: landing pages SaaS](https://www.involve.me/blog/saas-landing-pages)
- [designrevision: padrões B2B](https://designrevision.com/blog/b2b-saas-landing-pages.md)
- [Idealista: 10.324 AL encerrados](https://www.idealista.pt/news/node/75957)
- [ECO: 40 mil AL vão desaparecer dos registos](https://eco.sapo.pt/2025/10/24/40-mil-alojamentos-locais-vao-desaparecer-dos-registos-em-portugal/)
- [Idealista: empresas gerem mais de um terço do AL](https://www.idealista.pt/news/node/71297)
- [Capterra: Hostkit](https://capterra.com/p/10009366/Hostkit/)
- [Capterra PT: Smoobu](https://www.capterra.pt/software/160106/smoobu)
- [Chekin: obrigações do AL](https://chekin.com/pt/blog/obrigacoes-do-alojamento-local-em-portugal-um-guia-completo/)
- [SaaS Hero: marketing com pouco orçamento](https://www.saashero.net/strategy/bootstrapped-b2b-saas-marketing-2026/)
- [PriceLabs: relatório global de anfitriões](https://www.rentalscaleup.com/vacation-rental-owner-acquisition-global-host-report/)
