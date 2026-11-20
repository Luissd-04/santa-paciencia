// Esta proteção só se aplica ao ambiente de testes; produção não muda.
const isStaging = () => process.env.APP_ENV === 'staging';
function assertStagingEnvironment() {
  if (!isStaging()) return;
  if (process.env.EMAIL_ENABLED !== 'false') throw new Error('Staging exige EMAIL_ENABLED=false.');
  for (const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_ORGANIZATION_ID','ANTHROPIC_API_KEY','TOKEN_ENCRYPTION_KEY','TOKEN_ENCRYPTION_KEY_FILE','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY']) {
    if (String(process.env[key] || '').trim()) throw new Error(`Staging não permite credenciais externas em ${key}.`);
  }
  if (process.env.DB_PATH !== '/app/data/staging.db' && process.env.NODE_ENV !== 'test') throw new Error('Staging exige a base dedicada /app/data/staging.db.');
}
module.exports = { isStaging, assertStagingEnvironment };
