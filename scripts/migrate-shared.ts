/**
 * Apply pending migrations to the shared Supabase project.
 *
 *   SUPABASE_ACCESS_TOKEN=... npm run db:migrate            # apply
 *   SUPABASE_ACCESS_TOKEN=... npm run db:migrate -- --check # list only
 *
 * Uses the Management API's SQL endpoint. Every file passes the migration
 * guard first (only the `money` schema, no extensions, no Auth, no global
 * defaults) and runs in one transaction together with its bookkeeping row.
 *
 * Applied migrations are recorded in money.schema_migrations — deliberately
 * not in supabase_migrations, which the project's other apps own: an unknown
 * version there makes their `supabase db push` refuse to run.
 *
 * Prints file names and status codes only, never a token or a key.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { migrationProblems } from './lib/migration-guard';

const REF = process.env.SUPABASE_PROJECT_REF ?? 'zwxzpdvffvvqlhkegbhd';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const CHECK_ONLY = process.argv.includes('--check');
const DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

if (!TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN (a Supabase personal access token).');
  process.exit(1);
}

async function query<T = unknown>(sql: string): Promise<T[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    // JSON.stringify keeps Hebrew intact; the body is never hand-assembled.
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : []) as T[];
}

const BOOKKEEPING = `
create table if not exists money.schema_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
alter table money.schema_migrations enable row level security;
`;

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const problems = migrationProblems(readFileSync(join(DIR, file), 'utf8'));
  if (problems.length > 0) {
    console.error(`Refusing ${file}: it ${problems.join('; ')}.`);
    process.exit(1);
  }
}

const exists =
  (await query<{ exists: boolean }>(`select to_regclass('money.schema_migrations') is not null as exists`))[0]?.exists ?? false;
const applied = new Set(
  exists ? (await query<{ name: string }>('select name from money.schema_migrations')).map((r) => r.name) : [],
);
const pending = files.filter((f) => !applied.has(f));

console.log(`Project ${REF}: ${applied.size} applied, ${pending.length} pending.`);
for (const file of pending) console.log(`  pending  ${file}`);
if (CHECK_ONLY || pending.length === 0) process.exit(0);

for (const file of pending) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  const name = file.replace(/'/g, "''");
  await query(`begin;\n${sql}\n${BOOKKEEPING}\ninsert into money.schema_migrations (name) values ('${name}');\ncommit;`);
  console.log(`  applied  ${file}`);
}
