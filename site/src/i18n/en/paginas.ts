// Text pages in English: early access, 404, about, contact, FAQ, indexes and legal pages.
// Same structure as ../pt/paginas.ts.
import type { Dict } from '../index';

export const acesso: Dict['acesso'] = {
  titulo: 'Request early access',
  descricao: 'Request early access to vacation rental software made in Portugal. Guided setup, and no credit card needed.',
  kickerTag: 'Limited spots',
  kicker: 'Opening in order of request',
  h1: 'Be among the first.',
  lede: 'We are opening up gradually, so we can look after every property closely. Leave your details and we will take care of the rest.',
  passos: [
    ['We reply by email', 'To get to know your property and book a quick chat.'],
    ['We set it up with you', 'Your properties, prices and the bookings you already have. Ready in an afternoon.'],
    ['You get your first booking', 'Through your own site, with the deposit paid and the calendar up to date.'],
  ],
};

export const erro404: Dict['erro404'] = {
  titulo: 'Page not found',
  descricao: 'This page does not exist or has moved. Head back to the homepage, or have a look at the features and pricing.',
  kickerTag: '404',
  kicker: 'Page not found',
  h1: 'This page got lost along the way.',
  lede: 'The address may be wrong, or the page may have moved. Go back to the homepage and you will find everything.',
  voltar: 'Back to the homepage',
  precos: 'See pricing',
};

export const sobre: Dict['sobre'] = {
  titulo: 'About us: born in an Alentejo guesthouse',
  descricao: 'Our vacation rental software was born in a guesthouse in the Alentejo, made in Portugal by people who know the tourist tax and the Complaints Book.',
  caminho: 'About',
  h1: 'It was born in a guesthouse in the Alentejo.',
  lede: 'It was not a boardroom idea. It was what a real guesthouse was missing.',
  historiaAria: 'Our story',
  abre: 'It started as a fix for the problems of a real holiday rental in Reguengos de Monsaraz. Bookings, payments, guests and cleaning: everything that takes work when you welcome people into your home.',
  p2: 'Every feature was tested there first, in the day-to-day of that house, and only stayed once it made the work simpler.',
  p3: 'It is made in Portugal by people who know the tourist tax, SIBA and the Complaints Book (Livro de Reclamações), and who know that high season shows no mercy.',
  p4Antes: 'Now it is opening up to other properties, gradually. If you run one home or ten and these problems sound familiar, ',
  p4Acesso: 'request early access',
  p4Meio: ' or ',
  p4Contacto: 'get in touch',
  pontos: [
    { icone: 'key', titulo: 'Tested in a real house', texto: 'Every feature was used first in a working holiday rental, in Reguengos de Monsaraz.' },
    { icone: 'flag', titulo: 'Made in Portugal', texto: 'By people who know the tourist tax, SIBA and the Complaints Book.' },
    { icone: 'guest', titulo: 'Opening gradually', texto: 'We are welcoming other properties in order of request, so we can look after each one closely.' },
  ],
  fimTitulo: 'Come and see it from the inside.',
  fimTexto: 'We are opening up gradually, with hands-on help getting set up. Save your spot.',
};

export const contacto: Dict['contacto'] = {
  titulo: 'Contact us',
  descricao: 'A question, an idea or just curious about our vacation rental software? Write to us and we will reply by email.',
  h1: 'Get in touch.',
  lede: 'A question, an idea or just curiosity. We reply by email.',
  preferir: 'Prefer to write directly?',
  formTitulo: 'Send a message',
  formBotao: 'Send message',
  formMensagem: 'Your message',
  formModo: 'Contact',
  formNota: 'We only use your details to reply to this message.',
};

export const perguntas: Dict['perguntas'] = {
  titulo: 'Vacation rental software FAQ',
  descricao: 'Quick answers about pricing, Airbnb and Booking.com, SIBA, payments, your data and switching from another tool.',
  caminho: 'FAQ',
  h1: 'Questions we always get.',
  lede: 'Straight answers, including what the platform does not do yet. If you cannot find yours, write to us.',
  porTemaAria: 'Questions by topic',
  temasAria: 'Topics',
  fimTitulo: 'Still have a question?',
  fimTexto: 'Write to us or request early access. We reply by email, with no sales talk.',
  // Only claims what the platform does (docs/SITE-MAPA-SEO.md, section 6).
  temas: [
    { id: 'getting-started', titulo: 'Getting started', itens: [
      ['Do I need to install anything?', 'No. It runs in your browser, on computer and phone. If you like, you can add it to your phone’s home screen like an app and receive notifications.'],
      ['Can I switch mid-season?', 'Yes. We help you move across the bookings you already have, so nothing gets lost along the way.'],
      ['Do I need a website?', 'No. The booking page works on its own and you can share it on social media or by message.'],
      ['Does it work with WordPress?', 'Yes. Just paste two lines of code into a page.'],
    ] },
    { id: 'bookings', titulo: 'Bookings and calendar', itens: [
      ['Does it work with Airbnb and Booking.com?', 'Bookings from those platforms live in the same calendar, entered by you with the channel noted. Automatic sync does not exist yet; bookings made on your own site arrive by themselves.'],
      ['Can I block dates for myself?', 'Yes. Blocks show up in the calendar and those dates stop being available on your own booking page.'],
    ] },
    { id: 'payments', titulo: 'Payments', itens: [
      ['How do online payments work?', 'The guest gets an email with a link and pays securely by card, through Stripe. You choose whether to collect just the deposit or the full amount, and when the rest is due. Your cancellation policy is shown to the guest before they pay, and refunds are recorded.'],
      ['Is there a commission per booking?', 'No. You only pay for the plan. Card payments carry Stripe’s fees, as in any online shop.'],
      ['Do you issue invoices to guests?', 'No. It records the amounts and payments for each booking, but it is not certified invoicing software. Keep issuing invoices in the program you already use.'],
      ['Does it calculate the tourist tax?', 'It calculates it in your bookings and reports, by month and by property. Handing it over to the council is still up to you.'],
    ] },
    { id: 'guests', titulo: 'Guests and SIBA', itens: [
      ['Does it report guests to SIBA?', 'Pre-check-in collects all the data SIBA asks for. You still submit the report yourself, but with the data already organised.'],
      ['What about guest privacy?', 'Guests see the privacy notice before sending their details, and their acceptance is recorded.'],
      ['Where do the automatic emails come from?', 'From your own Gmail, so guests reply to you and the conversation stays with the booking. Templates exist in seven languages: Portuguese, English, French, Spanish, German, Italian and Dutch.'],
    ] },
    { id: 'pricing', titulo: 'Pricing', itens: [
      ['How much does it cost?', 'There are three monthly plans, depending on how many properties you have, and no commission per booking. You can see everything on the pricing page.'],
      ['Can I change plan?', 'Any time, up or down.'],
      ['Is there a minimum term?', 'No. On the monthly plan you can cancel whenever you like.'],
      ['Do the prices include VAT?', 'The prices shown do not include VAT at the legal rate in force.'],
      ['Does my team pay per user?', 'It depends on the plan: Essential includes 2 users, Professional 5, and Premium has no limit.'],
    ] },
    { id: 'data', titulo: 'Data and security', itens: [
      ['Is my data safe?', 'Yes. Access is protected, each team member sees only what they need, and guest consent is stored.'],
      ['Can I export my data?', 'Yes, whenever you like. There are backups and exports of your data.'],
      ['Can my team see the business numbers?', 'They do not need to. The team sees arrivals and tasks, not the numbers, and permissions define what each person can see.'],
      ['Is it recorded who did what?', 'Yes. Cancellations, refunds and permission changes are recorded.'],
    ] },
  ],
};

export const indiceFuncionalidades: Dict['indiceFuncionalidades'] = {
  titulo: 'Vacation rental software features',
  descricao: 'Calendar, direct bookings, payments, online check-in, cleaning, guest emails, expenses and reports: everything a holiday rental needs, in one place.',
  caminho: 'Features',
  h1: 'Everything you need. Nothing you don’t.',
  lede: 'Eight tools that work together. Start with the ones you need today; the rest are there when your business grows.',
  oitoAria: 'The eight features',
  saberMais: 'Learn more',
  aindaH2: 'Plus',
  ainda: [
    ['Works as a phone app.', 'Add it to your home screen and get notifications.'],
    ['Backups.', 'Export your data whenever you like.'],
    ['A record of who did what.', 'Cancellations, refunds and permissions are logged.'],
    ['Help inside the app.', 'Talk to us without leaving the page.'],
  ],
};

export const indicePara: Dict['indicePara'] = {
  titulo: 'Who it’s for: hosts, managers & companies',
  descricao: 'From your first property to a management company: see how the software fits owners, managers of several properties and property management companies.',
  caminho: 'Who it’s for',
  h1: 'From your first room to a management company.',
  lede: 'One platform, three ways to use it. Pick the one that looks most like your day.',
  perfisAria: 'Profiles',
  verComoAjuda: 'See how it helps',
  perfis: [
    ['1–3 properties', 'Owners', 'You run your properties in your spare time and want to stop living glued to your phone.', 'proprietarios'],
    ['4–20 properties', 'Managers of several properties', 'You need to see everything at once: who is arriving, who has paid, what still needs cleaning.', 'gestores'],
    ['20+ properties', 'Management companies', 'Teams, role-based permissions and reports to send to each owner.', 'empresas-de-gestao'],
  ],
};

export const indiceGuias: Dict['indiceGuias'] = {
  titulo: 'Guides for holiday rental hosts in Portugal',
  descricao: 'Practical guides for holiday rental hosts: organise your bookings, set deposits and cancellations, and get ready for guest arrivals.',
  caminho: 'Guides',
  h1: 'Guides for holiday rental hosts.',
  lede: 'Practical advice, no waffle, to host better and work less.',
  guiasAria: 'Guides',
  leitura: 'min read',
  ler: 'Read the guide',
};

export const guia: Dict['guia'] = {
  kicker: 'Guide',
  publicado: 'Published on',
  leitura: '{min} min read',
  fimPergunta: 'Want to see this working in your own home?',
  fimTexto: 'We are opening up gradually, with hands-on help getting set up.',
  pedir: 'Request early access',
  continuar: 'Keep reading.',
  guiaPrefixo: 'Guide: ',
};

export const privacidade: Dict['privacidade'] = {
  titulo: 'Privacy policy',
  descricao: 'How {marca} handles the personal data of people who visit the site, request early access or contact us.',
  h1: 'Privacy policy',
  atualizado: '24 November 2026',
  blocos: [
    { h: 'Who is responsible for the data', html: '<p>The controller of the data collected on this site is the entity that operates {marca} [identification, tax number and address to be completed]. You can contact us at {email}.</p>' },
    { h: 'What data we collect on this site', html: '<ul><li><strong>Early access and contact forms:</strong> name, email, phone (if you give it), number of properties, channels where you list, the subject and the message you write.</li><li><strong>Technical data:</strong> the usual server logs (IP address, date and page requested), kept for a limited time for security and diagnostics.</li></ul><p>This site does not use advertising cookies or third-party tracking tools.</p>' },
    { h: 'What we use the data for', html: '<p>We use the form data only to reply to your request and, if you wish, to arrange your access setup. The legal basis is your own initiative in contacting us (pre-contractual steps at your request).</p>' },
    { h: 'How long we keep it', html: '<p>We keep contact requests for as long as the conversation lasts and, at most, 12 months after the last contact, unless you become a customer in the meantime.</p>' },
    { h: 'Your rights', html: '<p>You can ask for access to, correction or deletion of your data, and object to its processing, by writing to {email}. You also have the right to lodge a complaint with the Comissão Nacional de Proteção de Dados (CNPD), Portugal’s data protection authority.</p>' },
    { h: 'Data processed inside the platform', html: '<p>The data customers enter into the platform (for example, guest details) is processed by {marca} on the customer’s behalf, and the customer is responsible for that data. The terms of that processing are set out in the service contract.</p>' },
  ],
};

export const termos: Dict['termos'] = {
  titulo: 'Terms of use',
  descricao: 'Terms for using the {marca} website: content, prices shown, intellectual property and governing law.',
  h1: 'Terms of use',
  atualizado: '24 November 2026',
  blocos: [
    { h: 'Scope', html: '<p>These terms govern the use of this website. Customers’ use of the {marca} platform is governed by a separate contract.</p>' },
    { h: 'Website content', html: '<p>The text, images and illustrations on this site are meant to present the platform. Screen illustrations use sample data. We try to keep the information up to date, but features and prices may change; the conditions that apply are those stated in the proposal we send you.</p>' },
    { h: 'Prices', html: '<p>The prices shown exclude VAT and may change. Any price change for existing customers is communicated in advance.</p>' },
    { h: 'Intellectual property', html: '<p>The name, logo and content of this site belong to {marca} and may not be reproduced without permission.</p>' },
    { h: 'Governing law', html: '<p>These terms are governed by Portuguese law.</p>' },
    { h: 'Contact', html: '<p>For any question about these terms, write to {email}.</p>' },
  ],
};
