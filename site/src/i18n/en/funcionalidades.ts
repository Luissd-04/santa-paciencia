// Features in English: home tiles and the text of each page (/en/features/<slug>/).
// Same structure as ../pt/funcionalidades.ts. SEO keywords from docs/SITE-MAPA-SEO.md, section 3.2,
// but without promising what does not exist (no Airbnb/Booking.com sync: section 6).
import type { Dict } from '../index';

export const funcionalidades: Dict['funcionalidades'] = {
  ladrilhos: {
    'calendario': { titulo: 'One calendar for everything', texto: 'Bookings from your site, Airbnb, Booking.com and the phone, side by side. No more juggling three apps.' },
    'reservas-diretas': { titulo: 'Bookings on your own site', texto: 'A lovely booking page, or a button on the website you already have. No commission.' },
    'pagamentos-online': { titulo: 'Payments that collect themselves', texto: 'Deposit and balance by card, on the right dates. No chasing anyone.' },
    'pre-check-in': { titulo: 'Guests who arrive registered', texto: 'Pre-check-in on their phone, with the SIBA details ready to use.' },
    'equipa-e-tarefas': { titulo: 'Cleaning without WhatsApp', texto: 'Every task has an owner, a time and a property. The team sees it all on their phone.' },
    'mensagens-automaticas': { titulo: 'Emails that write themselves', texto: 'Confirmation, arrival instructions and a thank-you, in 7 languages.' },
    'despesas': { titulo: 'Expenses without the shoebox', texto: 'Snap the receipt and it is logged under the right property.' },
    'relatorios': { titulo: 'Your numbers, always in view', texto: 'Revenue, occupancy and margin by property and by month, no formulas.' },
  },

  calendario: {
    titulo: 'Vacation rental calendar for all your bookings',
    descricao: 'One calendar for every booking at your vacation rental: your own site, Airbnb, Booking.com and phone. With seasonal pricing and minimum stays.',
    nome: 'Calendar',
    h1: 'One calendar. Every booking. Zero mix-ups.',
    lede: 'The booking calendar for your vacation rental brings together your own site, Airbnb, Booking.com and the phone. See at a glance who is arriving, who is leaving and which nights are still up for grabs.',
    tituloPassos: 'Wherever it comes from, the booking lands in the same place.',
    passos: [
      { titulo: 'Website bookings arrive by themselves', texto: 'Anyone who books on your page appears in the calendar straight away, deposit included.' },
      { titulo: 'The others take a minute to enter', texto: 'Airbnb, Booking.com or phone: each booking keeps the channel it came from.' },
      { titulo: 'See it all at a glance', texto: 'One row per property, one bar per booking. What is free jumps out at you.' },
    ],
    tituloBeneficios: 'Right prices, nights well sold.',
    beneficios: [
      { titulo: 'Seasonal pricing', texto: 'Summer, Easter, weekends: set it once and the total works itself out.' },
      { titulo: 'Minimum stay', texto: 'No stray single nights in the middle of August.' },
      { titulo: 'Drag to change', texto: 'Move the dates and the price follows.' },
      { titulo: 'Every booking has a history', texto: 'Guest, amounts, payments and who changed what.' },
    ],
    perguntas: [
      ['Does it sync automatically with Airbnb and Booking.com?', 'Not yet. Bookings from those platforms are entered by you, with the channel noted, and sit in the same calendar as your direct bookings. Bookings made on your own page arrive by themselves.'],
      ['Can I block dates for myself?', 'Yes. Blocks show up in the calendar and those dates stop being available on your booking page.'],
    ],
    visualAria: 'Booking calendar with alerts: new booking from the website and a Booking.com booking recorded',
    avisos: [
      { titulo: 'New booking', texto: 'From your website · Loft do Rio' },
      { titulo: 'Booking recorded', texto: 'Booking.com · Quarto Azul' },
    ],
    precos: {
      titulo: 'Pricing · Casa da Eira', etiqueta: 'By season',
      linhas: [
        { t: 'Low season', s: '1 Nov to 31 Mar · min. 2 nights', v: '€70 / night' },
        { t: 'Spring', s: '1 Apr to 14 Jun · min. 2 nights', v: '€95 / night' },
        { t: 'Summer', s: '15 Jun to 15 Sep · min. 4 nights', v: '€140 / night' },
        { t: 'Summer weekends', s: 'Fri and Sat · min. 3 nights', v: '€160 / night' },
      ],
    },
  },

  'reservas-diretas': {
    titulo: 'Direct booking engine for holiday rentals',
    descricao: 'Take direct bookings at your holiday rental, with your own booking page or inside your website. No commission, and the deposit is paid by card.',
    nome: 'Direct bookings',
    h1: 'Your bookings, with no commission along the way.',
    lede: 'Direct bookings for your holiday rental: a lovely booking page to share, or a button inside the website you already have. The guest picks their dates, pays the deposit, and that is it.',
    tituloPassos: 'From link to booking, in three steps.',
    passos: [
      { titulo: 'Share the link or paste the button', texto: 'A booking page ready to share, or a button inside the website you already have.' },
      { titulo: 'The guest chooses and pays', texto: 'They pick the dates and the room, see the total and pay the deposit by card.' },
      { titulo: 'The booking lands in your calendar', texto: 'The dates are blocked and everything else follows on its own.' },
    ],
    tituloBeneficios: 'More bookings that stay whole.',
    beneficios: [
      { titulo: 'It matches your website', texto: 'Colours, font and corners copied from your site (Premium plan).' },
      { titulo: 'The right price every time', texto: 'The same seasonal and minimum-stay rules.' },
      { titulo: 'Discount vouchers', texto: 'For returning guests or partners, with clear rules.' },
      { titulo: 'Protected from bots', texto: 'Fake requests are turned away at the door.' },
    ],
    perguntas: [
      ['Do I need a website?', 'No. The booking page works on its own and you can share it on social media or by message.'],
      ['Does it work with WordPress?', 'Yes. Just paste two lines of code into a page.'],
    ],
    aviso: { titulo: 'Direct booking', texto: 'Quarto Azul · €0 commission' },
    vouchers: {
      titulo: 'Vouchers', etiqueta: 'Booking page',
      linhas: [
        { t: 'WELCOMEBACK10', s: 'Returning guests · 10%', pill: 'Active', tom: 'ok' },
        { t: 'PARTNER15', s: 'Partners · 15% · until 31 Dec', pill: 'Active', tom: 'ok' },
        { t: 'SPRING', s: 'Stays of 3 nights or more', pill: 'Expired', tom: 'espera' },
      ],
    },
  },

  'pagamentos-online': {
    titulo: 'Vacation rental online payments',
    descricao: 'Collect deposits and balances for your vacation rental bookings by card, with no bank transfers and no reminders. No commission per booking.',
    nome: 'Online payments',
    h1: 'Get the deposit without asking twice.',
    lede: 'Online payments for your vacation rental: the guest pays by card, the booking confirms itself and the balance is collected on the right date.',
    tituloPassos: 'Three steps, and none of them is yours.',
    passos: [
      { titulo: 'A booking comes in', texto: 'Through your site or entered by you. The deposit amount is worked out from your rules.' },
      { titulo: 'The guest pays', texto: 'They get an email with a link and pay securely by card, through Stripe.' },
      { titulo: 'Everything updates', texto: 'The booking is confirmed, the payment recorded and the balance scheduled.' },
    ],
    tituloBeneficios: 'Less time at the bank, more nights sold.',
    beneficios: [
      { titulo: 'Deposit or full payment', texto: 'Choose the percentage and when the rest is collected.' },
      { titulo: 'A clear cancellation policy', texto: 'Guests see it before they pay. Refunds are recorded.' },
      { titulo: 'No commission per booking', texto: 'You only pay card fees, as in any online shop.' },
      { titulo: 'Everything in the monthly report', texto: 'Each payment is linked to the booking, the property and the channel.' },
    ],
    cartao: {
      casa: 'Casa da Eira', pill: 'Deposit · 30%', valor: '€120.00', hospede: 'The Lopes family · 9 to 12 November',
      linhas: [['Stay total', '€400.00'], ['Balance on 2 November', '€280.00'], ['Tourist tax', '€12.00']],
      botao: 'Pay €120.00',
    },
    aviso: { titulo: 'Paid by card', texto: 'Booking confirmed' },
    telemovel: {
      titulo: 'Payments', sub: 'November',
      itens: [
        { hora: '02 Nov', titulo: 'Balance · Casa da Eira', texto: '€280.00 collected' },
        { hora: '28 Oct', titulo: 'Deposit · Quarto Azul', texto: '€54.00 by card' },
        { hora: '27 Oct', titulo: 'Refund · Loft do Rio', texto: 'Cancelled within the deadline' },
        { hora: '09 Nov', titulo: 'Balance · Monte Branco', texto: 'Scheduled · €310.00', feito: false, destaque: true },
      ],
    },
  },

  'mensagens-automaticas': {
    titulo: 'Automated guest messaging for holiday lets',
    descricao: 'Automatic emails for your holiday rental guests: confirmation, check-in instructions and a thank-you, in 7 languages, sent from your own Gmail.',
    nome: 'Guest messaging',
    h1: 'Write it once. It always goes out at the right time.',
    lede: 'Automated guest messaging for your holiday rental: the confirmation, the check-in instructions and the thank-you go out on their own, from your own email, in each guest’s language.',
    tituloPassos: 'Write once, the rest sends itself.',
    passos: [
      { titulo: 'Pick your templates', texto: 'Confirmation, check-in instructions, thank-you. Tweak the wording to sound like you.' },
      { titulo: 'Connect your Gmail', texto: 'Emails go out from your address, with your signature.' },
      { titulo: 'Emails send themselves', texto: 'At the right time and in each guest’s language.' },
    ],
    tituloBeneficios: 'Well-informed guests, no typing.',
    beneficios: [
      { titulo: 'In 7 languages', texto: 'Portuguese, English, French, Spanish, German, Italian and Dutch.' },
      { titulo: 'From your own address', texto: 'Guests reply to you, and the conversation stays with the booking.' },
      { titulo: 'Instructions only when it makes sense', texto: 'The door code and directions only go out once the booking is in order.' },
      { titulo: 'Always know what went out', texto: 'Sent, scheduled or failed, in plain view.' },
    ],
    cartao: {
      titulo: 'The Lopes family', sub: 'Casa da Eira · 9 to 12 Nov',
      linhas: [
        { t: 'Booking confirmation', s: '28 Oct · PT', pill: 'Sent', tom: 'ok' },
        { t: 'Pre-check-in request', s: '5 Nov · PT', pill: 'Sent', tom: 'ok' },
        { t: 'Arrival instructions', s: '9 Nov, 09:00 · PT', pill: 'Scheduled', tom: 'espera' },
        { t: 'Thank-you', s: '12 Nov, 12:00 · PT', pill: 'Scheduled', tom: 'espera' },
      ],
    },
    aviso: { titulo: 'Email sent', texto: 'Confirmation · The Lopes family' },
  },

  'pre-check-in': {
    titulo: 'Online check-in for vacation rentals & SIBA',
    descricao: 'Online pre-check-in for your vacation rental: guests fill in their details on their phone before arriving, with the fields SIBA asks for already included.',
    nome: 'Online check-in',
    h1: 'The guest arrives. The paperwork is already done.',
    lede: 'With online check-in for your vacation rental, guests fill in their details on their phone before the trip. At the door, only the good part is left: welcoming them.',
    tituloPassos: 'Guests sort everything out before they leave home.',
    passos: [
      { titulo: 'The booking is confirmed', texto: 'Once the deposit is paid or the booking accepted, pre-check-in becomes available.' },
      { titulo: 'The guest gets the link', texto: 'By email, a few days before arrival, on their phone and in their language.' },
      { titulo: 'The details land in the booking', texto: 'Lead guest, companions and arrival time, organised in the booking.' },
    ],
    tituloBeneficios: 'Arrivals without paperwork or questions.',
    beneficios: [
      { titulo: 'No accounts, no apps', texto: 'The guest opens the link and fills it in within two minutes.' },
      { titulo: 'Everything SIBA asks for', texto: 'ID document, nationality, dates: organised and ready to report.' },
      { titulo: 'Arrival time', texto: 'You know when to get the house ready.' },
      { titulo: 'Guest portal', texto: 'Address, instructions and contacts in a single link.' },
    ],
    perguntas: [
      ['Does it report to SIBA by itself?', 'Not yet. SIBA is the Portuguese system for reporting foreign guests to the authorities. The platform collects and organises the data, and you still submit the report yourself.'],
      ['What about guest privacy?', 'Guests see the privacy notice before sending their details, and their acceptance is recorded.'],
    ],
    aviso: { titulo: 'Pre-check-in done', texto: 'The Lopes family · 4 guests' },
    telemovel: {
      titulo: 'Arrivals', sub: 'Sat, 9 Nov',
      itens: [
        { hora: '16:30', titulo: 'The Lopes family · Casa da Eira', texto: 'Pre-check-in done · 4 guests' },
        { hora: '18:00', titulo: 'Ana and Pedro · Loft do Rio', texto: 'Pre-check-in done · 2 guests' },
        { hora: '19:30', titulo: 'J. Almeida · Quarto Azul', texto: 'Not filled in yet', feito: false, destaque: true },
      ],
    },
  },

  despesas: {
    titulo: 'Expense tracking for vacation rentals',
    descricao: 'Log your vacation rental expenses with a photo of the receipt. Sorted by property, category and supplier, and ready for your accountant.',
    nome: 'Expenses',
    h1: 'The shoebox can retire.',
    lede: 'Expense tracking for your vacation rental starts on your phone: snap the receipt, confirm the amount and it is filed under the right property.',
    tituloPassos: 'From receipt to record, in three taps.',
    passos: [
      { titulo: 'Snap the receipt', texto: 'With your phone, right in the shop. No letters, no scanning.' },
      { titulo: 'Check what was read', texto: 'Date, amount and supplier come filled in. Fix anything that needs fixing.' },
      { titulo: 'It lands in the right property', texto: 'Sorted by property and category, and it already counts in your reports.' },
    ],
    tituloBeneficios: 'Books in order all year round.',
    beneficios: [
      { titulo: 'Automatic reading', texto: 'Date, amount and supplier filled in for you.' },
      { titulo: 'By property and category', texto: 'Cleaning, maintenance, supplies.' },
      { titulo: 'Suppliers at hand', texto: 'Contacts and how much you paid each one.' },
      { titulo: 'Ready for your accountant', texto: 'Export the month in one click.' },
    ],
    perguntas: [
      ['Is the receipt reading always right?', 'Reading is optional and just saves you typing: you always confirm the amounts before saving.'],
    ],
    aviso: { titulo: 'Receipt read', texto: 'Central Drugstore · €38.40' },
    mes: {
      titulo: 'Expenses · November', sub: 'By property',
      linhas: [
        { t: 'Central Drugstore', s: '6 Nov · Casa da Eira · Supplies', v: '€38.40' },
        { t: 'Rio Laundry', s: '4 Nov · Loft do Rio · Cleaning', v: '€64.00' },
        { t: 'Pereira Plumbing', s: '2 Nov · Monte Branco · Maintenance', v: '€85.00' },
        { t: 'November total', s: '3 expenses', v: '€187.40' },
      ],
    },
  },

  'equipa-e-tarefas': {
    titulo: 'Vacation rental cleaning schedule & team',
    descricao: 'Assign cleaning, maintenance and check-ins to your holiday rental team, with phone alerts and role-based permissions.',
    nome: 'Cleaning & team',
    h1: 'Everyone knows what to do. And when.',
    lede: 'A vacation rental cleaning schedule without WhatsApp groups: every task has a property, a time and a person in charge, and the team sees it all on their phone.',
    tituloPassos: 'From check-out to “all ready”, with no messages.',
    passos: [
      { titulo: 'The check-out is set', texto: 'When a booking ends, the cleaning is planned for the right day.' },
      { titulo: 'The cleaning is assigned', texto: 'With property, time and person in charge. Whoever is picked gets the alert.' },
      { titulo: 'Rita marks it done', texto: 'From her phone, without calling anyone. You see straight away that the house is ready.' },
    ],
    tituloBeneficios: 'A team in sync, without meetings.',
    beneficios: [
      { titulo: 'Phone alerts', texto: 'New task, new arrival, pre-check-in done.' },
      { titulo: 'Everyone sees what they should', texto: 'The team sees arrivals and tasks, not the numbers.' },
      { titulo: 'Google Tasks and Calendar', texto: 'Tasks show up where your team already is.' },
      { titulo: 'Departments', texto: 'For bigger teams, with people in charge.' },
    ],
    perguntas: [
      ['Does my team pay per user?', 'It depends on the plan: Essential includes 2 users, Professional 5, and Premium has no limit.'],
    ],
    aviso: { titulo: 'New task', texto: 'Cleaning · Casa da Eira · 10:00' },
    telemovel: {
      titulo: 'Today', sub: 'Sat, 9 Nov',
      itens: [
        { hora: '10:00', titulo: 'Cleaning · Casa da Eira', texto: 'Rita · Lopes family check-out', feito: false, destaque: true },
        { hora: '12:30', titulo: 'Cleaning · Quarto Azul', texto: 'Rita · J. Almeida check-out' },
        { hora: '15:00', titulo: 'Maintenance · Loft do Rio', texto: 'Kitchen tap · Paulo', feito: false },
        { hora: '16:30', titulo: 'Arrival · Monte Branco', texto: 'Sofia M. · 2 guests', feito: false },
      ],
    },
    funcoes: {
      titulo: 'Team', etiqueta: 'By role',
      linhas: [
        { t: 'Management', s: 'Bookings, payments and reports', pill: 'Sees everything', tom: 'ok' },
        { t: 'Rita · Cleaning', s: 'Arrivals and tasks for her properties', pill: 'No numbers', tom: 'espera' },
        { t: 'Paulo · Maintenance', s: 'Only the tasks assigned to him', pill: 'No numbers', tom: 'espera' },
      ],
    },
  },

  relatorios: {
    titulo: 'Vacation rental reporting: occupancy & revenue',
    descricao: 'Revenue, occupancy, expenses and margin for your vacation rental by month, by property and by channel. Always up to date, no spreadsheets.',
    nome: 'Reports',
    h1: 'How much did you earn this month? Already done.',
    lede: 'Vacation rental reports built from what you have already logged: revenue, occupancy and margin by property and by channel, without a single formula.',
    tituloPassos: 'Three questions the report answers by itself.',
    passos: [
      { titulo: 'Which property earns the most?', texto: 'Revenue and occupancy side by side, property by property, month by month.' },
      { titulo: 'How much came from Airbnb and how much was direct?', texto: 'Revenue by channel, to see what weighs most and what you saved.' },
      { titulo: 'How much was left after expenses?', texto: 'The margin, with expenses by category.' },
    ],
    tituloBeneficios: 'Your business numbers, without spreadsheets.',
    beneficios: [
      { titulo: 'Revenue and occupancy month by month', texto: 'All properties or one at a time.' },
      { titulo: 'Revenue by channel', texto: 'See how much you paid in commission and how much you saved.' },
      { titulo: 'Real margin', texto: 'Revenue minus expenses, by category.' },
      { titulo: 'Tourist tax calculated', texto: 'By month and by property.' },
    ],
    aviso: { titulo: 'Report ready', texto: 'June · 4 properties' },
  },
};
