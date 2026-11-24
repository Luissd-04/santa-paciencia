// Home (/en/): English text. Same structure as ../pt/inicio.ts.
import type { Dict } from '../index';

export const inicio: Dict['inicio'] = {
  titulo: 'Vacation rental software made in Portugal',
  descricao: 'Bookings, payments, guests and cleaning for your Portuguese holiday rental in one place. No commission per booking, made in Portugal. Request early access.',
  appDescricao: 'Vacation rental management software for Portugal: bookings, online payments, pre-check-in, cleaning and reports.',
  hero: {
    kickerTag: 'New',
    kicker: 'Direct bookings on your own site, zero commission',
    h1: 'Holiday rental management without the headaches.',
    lede: 'Bookings, payments, guests and cleaning for your Portuguese holiday rental (Alojamento Local, or AL) in one place. Fewer phone calls and spreadsheets, more time to welcome the people who arrive.',
    cta: 'Try it out',
    ctaSec: 'See a normal day',
    factos: ['Nothing to install', 'Works on your phone', 'Guest emails in 7 languages'],
    palcoAria: 'Booking calendar with alerts: new booking from your website, deposit received and cleaning assigned',
    avisos: [
      { titulo: 'New booking', texto: 'From your website · €0 commission' },
      { titulo: 'Deposit received', texto: 'Quarto Azul · €54.00' },
      { titulo: 'Cleaning scheduled', texto: 'Saturday, 10:00 · Rita' },
    ],
  },
  dores: {
    h2: 'If you run a holiday rental, you have lived this.',
    itens: [
      ['22:47', '“Is the weekend still free?”', 'So you open three calendars just to be sure.'],
      ['Friday', 'Nobody knows if the deposit has landed.', 'You check the bank, your email and your messages. Twice.'],
      ['Saturday', 'The cleaning was arranged over WhatsApp.', 'At eleven at night, in a chat nobody can find any more.'],
      ['March', 'The receipts are in a shoebox.', 'And your accountant wants everything by Friday.'],
    ],
    resposta: 'We have been there too. That is why we put everything in one place.',
    ver: 'See how it looks',
  },
  dia: {
    h2: 'A normal day, no rushing.',
    sub: 'This is what happens while you are busy with something else.',
    passos: [
      ['09:12', 'A booking arrives from your website', 'No middlemen and no commission. The dates are blocked in your calendar and stop showing as free on your page.'],
      ['09:13', 'The guest pays the deposit', 'They get a link and pay by card. No need to send your IBAN or chase bank transfers.'],
      ['3 days before', 'Pre-check-in arrives', 'The guest fills in their details on their phone, with everything you need for SIBA, the system Portuguese hosts use to report foreign guests.'],
      ['The day before', 'Rita knows what to clean', 'The cleaning is assigned with a set time and shows up on her phone.'],
      ['Check-out', 'The numbers do themselves', 'The balance is collected, the tourist tax is calculated and the monthly report is up to date.'],
    ],
    telemovel: { titulo: 'Today', sub: 'Thu, 12 Nov' },
    hoje: [
      { hora: '09:12', titulo: 'New booking · Loft do Rio', texto: '3 nights · via your website' },
      { hora: '09:13', titulo: 'Deposit received', texto: '€120.00 by card' },
      { hora: '10:00', titulo: 'Cleaning · Casa da Eira', texto: 'Assigned to Rita', feito: false, destaque: true },
      { hora: '15:30', titulo: 'Pre-check-in done', texto: 'The Lopes family · 4 guests' },
      { hora: '16:00', titulo: 'Arrival · Casa da Eira', texto: 'Arrival instructions sent', feito: false },
    ],
  },
  tudo: {
    h2: 'Everything your rental needs. Nothing it doesn’t.',
    sub: 'Eight tools that talk to each other: the booking knows about the payment, the cleaning knows about the check-out, the report knows about everything.',
    saberMais: 'Learn more',
  },
  portugal: {
    h2: 'Made in Portugal, for hosts in Portugal.',
    sub: 'Foreign software has no idea what Lisbon’s tourist tax is, or what SIBA asks for. This one does.',
    cta: 'Try it out',
    itens: [
      ['receipt', 'Tourist tax calculated', 'Per night and per guest, already in your bookings and reports.'],
      ['key', 'SIBA data ready', 'Pre-check-in collects everything you need to report your guests.'],
      ['book', 'Deposits, balances and cancellations, Portuguese style', 'The rules you already use, applied the same way every time.'],
      ['flag', 'Guests in their own language', 'Automatic emails go out in 7 languages, English included.'],
      ['shield', 'GDPR handled', 'Each guest’s consent is stored with the booking.'],
    ],
  },
  quem: {
    h2: 'From your first room to a management company.',
    itens: [
      ['1–3', 'Owners', 'You run your properties in your spare time and want to stop living glued to your phone.', 'proprietarios'],
      ['4–20', 'Managers of several properties', 'You need to see everything at once: who is arriving, who has paid, what still needs cleaning.', 'gestores'],
      ['20+', 'Management companies', 'Teams, role-based permissions and reports to send to each owner.', 'empresas-de-gestao'],
    ],
  },
  perguntas: {
    h2: 'Questions we always get.',
    itens: [
      ['Does it work with Airbnb and Booking.com?', 'Bookings from those platforms live in the same calendar, entered by you with the channel noted. Automatic sync does not exist yet; bookings made on your own site arrive by themselves.'],
      ['Do I need to install anything?', 'No. It runs in your browser, on computer and phone. If you like, you can add it to your phone’s home screen like an app.'],
      ['How much does it cost?', 'There are three monthly plans, depending on how many properties you have, and no commission per booking. You can see everything on the pricing page.'],
      ['Does it report guests to SIBA?', 'Pre-check-in collects all the data SIBA asks for. You still submit the report yourself, but with the data already organised.'],
      ['Is my data safe?', 'Yes. Access is protected, each team member sees only what they need, and guest consent is stored.'],
      ['Can I switch mid-season?', 'Yes. We help you move across the bookings you already have, so nothing gets lost along the way.'],
    ],
  },
};
