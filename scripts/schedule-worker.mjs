// Points the every-minute pg_cron job at the deployed app.
//   node scripts/schedule-worker.mjs https://afterword.vercel.app
import postgres from 'postgres';
import { loadEnv } from './env.mjs';

loadEnv();
const url = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(url)) {
  console.error('usage: node scripts/schedule-worker.mjs https://<app-host>');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, max_pipeline: 1 });
await sql`select cron.unschedule('afterword-worker') where exists (select 1 from cron.job where jobname = 'afterword-worker')`;
await sql`select cron.schedule('afterword-worker', '* * * * *', ${`select kick_worker('${url.replace(/'/g, "''")}')`})`;
console.log((await sql`select jobname, schedule, command from cron.job`).map((j) => `${j.jobname} ${j.schedule} ${j.command}`).join('\n'));
await sql.end();
