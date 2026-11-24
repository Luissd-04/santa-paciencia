// «Who it's for» (/en/for/<profile>/): English text. Same structure as ../pt/perfis.ts.
import type { SlugPerfil } from '../rotas';
import type { PaginaPerfil } from '../pt/perfis';

export const perfis: Record<SlugPerfil, PaginaPerfil> = {
  proprietarios: {
    titulo: 'How to manage a holiday rental yourself',
    descricao: 'One or two properties, run in your spare time? Bookings, payments and guests handled for you, so you can stop living glued to your phone.',
    nome: 'Owners', fase: 2.4,
    h1: 'You have a holiday rental. You do not need a second job.',
    lede: 'For hosts running one, two or three properties in their spare time. Fewer messages, less maths in your head, more weekends of your own.',
    seccoes: [
      { id: 'week', titulo: 'What changes in the very first week.', blocos: [
        { icone: 'cal', titulo: 'One calendar', texto: 'Bookings from your site, Airbnb, Booking.com and the phone, all in one place. To know if the house is free, one glance is enough.' },
        { icone: 'pay', titulo: 'Deposits are paid by card', texto: 'The guest pays online and the booking is confirmed. No chasing bank transfers or checking your account (online payments from the Professional plan).' },
        { icone: 'key', titulo: 'Guests who arrive registered', texto: 'Pre-check-in is done on their phone, before the trip, with the details SIBA asks for already organised.' },
        { icone: 'mail', titulo: 'Emails that write themselves', texto: 'Confirmation, arrival instructions and a thank-you go out at the right time, in the guest’s language (from the Professional plan).' },
      ] },
      { id: 'time', titulo: 'How much time do you save?', blocos: [], frase: 'The jobs you do by hand today start happening on their own.' },
    ],
    planoTitulo: 'The plan that usually fits.',
    planoTexto: 'Start with Essential if you just want to leave the spreadsheet behind. Choose Professional if you want to take deposits online and have automatic emails.',
    planoIds: ['essencial', 'profissional'],
    fimTitulo: 'Your weekends will thank you.',
    fimTexto: 'We are opening up gradually, with hands-on help getting set up. Save your spot.',
  },
  gestores: {
    titulo: 'Software for vacation rental managers',
    descricao: 'Run several holiday rentals from one calendar: who is arriving, who has paid and what still needs cleaning, all at once.',
    nome: 'Managers of several properties', fase: 2.8,
    h1: 'Ten properties. One screen.',
    lede: 'When properties multiply, the problem is no longer the work, it is the coordination. Here you see everything at once.',
    seccoes: [
      { id: 'glance', titulo: 'At a glance.', colunas: 3, blocos: [
        { icone: 'key', titulo: 'Today’s arrivals', texto: 'Who is checking in, at what time and whether they have filled in pre-check-in.' },
        { icone: 'pay', titulo: 'Outstanding payments', texto: 'Deposits and balances still to collect, booking by booking, without opening the bank statement.' },
        { icone: 'clean', titulo: 'Cleaning still to do', texto: 'What still needs preparing before the next arrival, property by property.' },
      ] },
      { id: 'team', titulo: 'The team in sync.', blocos: [
        { icone: 'clean', titulo: 'Every task has an owner', texto: 'Cleaning, maintenance and check-ins assigned to whoever does them, with property and time.' },
        { icone: 'guest', titulo: 'Everyone sees what they should', texto: 'The team sees arrivals and tasks on their phone, but not the business numbers.' },
      ] },
      { id: 'numbers', titulo: 'The numbers for each property.', blocos: [
        { icone: 'chart', titulo: 'Revenue, occupancy and margin', texto: 'By property, by month and by channel, worked out from what you have already logged. No formulas.' },
        { icone: 'receipt', titulo: 'Expenses in the right property', texto: 'Snap the receipt and the expense is filed by property and category.' },
      ] },
    ],
    planoTitulo: 'The plan that usually fits.',
    planoTexto: 'Professional handles up to 10 properties and 5 users, with online payments, automatic emails and full reports.',
    planoIds: ['profissional'],
    fimTitulo: 'With ten properties, every minute counts.',
    fimTexto: 'We are opening up gradually, with hands-on help getting set up. Save your spot.',
  },
  'empresas-de-gestao': {
    titulo: 'Property management company software Portugal',
    descricao: 'Teams, departments, role-based permissions and reports per owner. Software for property management companies running holiday rentals in Portugal.',
    nome: 'Management companies', fase: 3.0,
    h1: 'Your company grows. The chaos does not.',
    lede: 'Teams, departments and permissions so everyone sees only what they need, plus PDF reports to send to each owner.',
    seccoes: [
      { id: 'permissions', titulo: 'Everyone sees what they need.', colunas: 3, blocos: [
        { icone: 'shield', titulo: 'Role-based permissions', texto: 'Front desk sees arrivals and tasks, management handles bookings and prices, administration sees the numbers.' },
        { icone: 'clean', titulo: 'Departments', texto: 'Organise the team by area, with people in charge, and assign tasks to whoever does them.' },
        { icone: 'book', titulo: 'Who did what', texto: 'Cancellations, refunds and permission changes are recorded.' },
      ] },
      { id: 'clients', titulo: 'For your owners and their websites.', blocos: [
        { icone: 'chart', titulo: 'Reports for owners', texto: 'Revenue, occupancy and expenses by property, as PDFs, ready to send to each owner.' },
        { icone: 'web', titulo: 'Bookings inside each client’s site', texto: 'The booking form appears inside the website, with that site’s colours, font and corners.' },
      ] },
    ],
    planoTitulo: 'The plan that usually fits.',
    planoTexto: 'Premium has no limit on properties or users, and includes team, departments, permissions, PDF reports and bookings inside your own website.',
    planoIds: ['premium'],
    fimTitulo: 'More properties, same calm.',
    fimTexto: 'We are opening up gradually, with hands-on help getting set up. Talk to us and we will work out how your team would look.',
  },
};
