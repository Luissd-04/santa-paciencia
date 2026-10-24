// Chromium real, aplicação real e base descartável. Nunca lê .env nem dados locais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('/Users/luisbernardo/Documents/santa_paciencia/backend/src/node_modules/@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-browser-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.FRONTEND_PATH = '/Users/luisbernardo/Documents/santa_paciencia/frontend';
const app = require('/Users/luisbernardo/Documents/santa_paciencia/backend/src/app');
const { db } = require('/Users/luisbernardo/Documents/santa_paciencia/backend/src/config/database');
const auth = require('/Users/luisbernardo/Documents/santa_paciencia/backend/src/services/authService');
const orgs = require('/Users/luisbernardo/Documents/santa_paciencia/backend/src/services/orgService');
let server, browser;
async function main() {
  const org = orgs.createOrganization('Interface Sintética');
  const user = auth.createUser({ name: 'Teste', email: 'browser@example.invalid', password: 'SyntheticBrowser123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const otherOrg = orgs.createOrganization('Outro espaço sintético');
  orgs.createMembership({ organizationId: otherOrg.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit', org.id, 'Unidade de teste', 'alojamento', 100, 4);
  const today = new Date().toISOString().slice(0, 10);
  const departure = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const insertGuest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
  const insertRes = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
    VALUES(?,?,?,'unit',?,?,2,1,200,'confirmada')`);
  db.transaction(() => {
    for (let n = 0; n < 12; n++) {
      const id = String(n).padStart(3, '0');
      insertGuest.run(id, org.id, `Hóspede ${id}`, `guest${id}@example.invalid`);
      insertRes.run(`r${id}`, org.id, id, today, departure);
    }
  })();
  const insertEvent = db.prepare(`INSERT INTO operational_events
    (id,organization_id,title,type,date,start_time,status,accommodation_id,responsible,important)
    VALUES (?,?,?,?,?,?,?,'unit',?,?)`);
  const eventTypes = ['limpeza', 'reuniao', 'manutencao', 'checkin'];
  db.transaction(() => {
    for (let n = 0; n < 12; n++) {
      const id = String(n).padStart(3, '0');
      const day = new Date(Date.now() + (n % 40) * 86400000).toISOString().slice(0, 10);
      insertEvent.run(`ev${id}`, org.id, `Evento ${id}`, eventTypes[n % 4], day,
        n % 3 ? '09:30' : null, n % 5 ? 'planeado' : 'concluido', `Resp ${n % 3}`, n % 7 ? 0 : 1);
    }
  })();

  const insertExpense = db.prepare(`INSERT INTO expenses
    (id,organization_id,date,description,category,amount,payment_method,supplier,invoice_ref,has_nif)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const expenseCats = ['limpeza', 'manutencao', 'marketing', 'servicos'];
  const currentYear = new Date().getFullYear();
  let expenseTotal = 0;
  db.transaction(() => {
    for (let n = 0; n < 12; n++) {
      const id = String(n).padStart(3, '0');
      const amount = 10 + n;
      expenseTotal += amount;
      insertExpense.run(`dp${id}`, org.id, `${currentYear}-0${(n % 9) + 1}-15`, `Despesa ${id}`,
        expenseCats[n % 4], amount, 'numerário', `Fornecedor ${n % 3}`, `FT-${id}`, n % 2);
    }
  })();
  global.__expenseTotal = expenseTotal;

  const insertMsg = db.prepare(`INSERT INTO invoice_messages
    (id,organization_id,to_email,to_name,subject,body_html,reservation_id,sent_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (let n = 0; n < 12; n++) {
      const id = String(n).padStart(3, '0');
      insertMsg.run(`msg${id}`, org.id, `guest${id}@example.invalid`, `Hospede ${id}`,
        `Assunto ${id}`,
        `<html><body><table><tr><td class="sp-pad sp-surface-bg email-body-bg"><!--sp:body--><p>Corpo sintetico ${id}</p><!--/sp:body--></td></tr></table></body></html>`,
        `r${id}`, `2026-05-${String(10 + n).padStart(2, '0')}T10:00:00Z`);
    }
    for (let n = 0; n < 4; n++) {
      insertMsg.run(`avulso${n}`, org.id, `avulso${n}@example.invalid`, `Avulso ${n}`,
        'Sem reserva', '<p>mensagem avulsa</p>', null, `2026-05-2${n}T10:00:00Z`);
    }
  })();

  db.prepare("UPDATE accommodations SET public_slug='auditoria-mobile', min_nights=1 WHERE id='unit'").run();
  const wrapper = require('/Users/luisbernardo/Documents/santa_paciencia/backend/src/node_modules/express')();
  wrapper.use((req, res, next) => {
    const delay = Number(process.env.AUDIT_DELAY_MS || 0);
    if (delay && (req.path.startsWith('/views/') || req.path.startsWith('/api/'))) setTimeout(next, delay);
    else next();
  });
  wrapper.use(app);
  server = wrapper.listen(0, '127.0.0.1', () => console.log('AUDIT_URL=http://127.0.0.1:' + server.address().port));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
