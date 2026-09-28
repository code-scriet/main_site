const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function main() {
  const result = await pool.query("SELECT code_execution_provider, show_execution_source, playground_daily_limit FROM settings WHERE id = 'default'");
  if (result.rows.length > 0) {
    console.log('code_execution_provider:', result.rows[0].code_execution_provider);
    console.log('show_execution_source:', result.rows[0].show_execution_source);
    console.log('playground_daily_limit:', result.rows[0].playground_daily_limit);
  } else {
    console.log('No settings row found');
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });