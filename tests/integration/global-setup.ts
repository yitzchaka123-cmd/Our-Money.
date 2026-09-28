/**
 * Integration-test stack: a throwaway Postgres cluster with every migration
 * applied, PostgREST in front of it, and a tiny proxy that serves it under
 * /rest/v1 — the same shape supabase-js talks to in production. The app code
 * runs unmodified against it with a service-role key signed for this stack.
 *
 * Needs Postgres server binaries (PG_BIN, or /usr/lib/postgresql/<v>/bin) and
 * a PostgREST binary (POSTGREST_BIN, `postgrest` on PATH, or downloaded once
 * into node_modules/.cache). Run with `npm run test:integration`.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const POSTGREST_VERSION = 'v12.2.3';
const JWT_SECRET = 'integration-tests-only-jwt-secret-0123456789';

function findPgBin(): string {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const versions = readdirSync(base).sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const bin = join(base, version, 'bin');
      if (existsSync(join(bin, 'initdb'))) return bin;
    }
  }
  throw new Error('Postgres server binaries not found. Set PG_BIN to the directory containing initdb.');
}

function findPostgrest(): string {
  if (process.env.POSTGREST_BIN) return process.env.POSTGREST_BIN;
  try {
    return execFileSync('which', ['postgrest']).toString().trim();
  } catch {
    // fall through to the cached download
  }
  const cacheDir = join(ROOT, 'node_modules', '.cache', 'postgrest');
  const bin = join(cacheDir, 'postgrest');
  if (!existsSync(bin)) {
    mkdirSync(cacheDir, { recursive: true });
    const archive = join(cacheDir, 'postgrest.tar.xz');
    execFileSync('curl', [
      '-sSfL',
      '-o',
      archive,
      `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`,
    ]);
    execFileSync('tar', ['-xJf', archive, '-C', cacheDir]);
  }
  return bin;
}

/** initdb refuses to run as root, so drop to the postgres user when we are root. */
function asPostgresUser(command: string, args: string[]): [string, string[]] {
  if (process.getuid?.() === 0) return ['runuser', ['-u', 'postgres', '--', command, ...args]];
  return [command, args];
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const [cmd, argv] = asPostgresUser(command, args);
  return execFileSync(cmd, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

export function signJwt(payload: Record<string, unknown>): string {
  const head = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

async function waitFor(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/** The roles Supabase provides, so migrations and grants behave as they do there. */
const ROLES_SQL = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login password 'authenticator' noinherit;
grant anon, authenticated, service_role to authenticator;
`;

const GRANTS_SQL = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
`;

let postgrest: ChildProcess | null = null;
let proxy: Server | null = null;
let dataDir = '';
let pgBin = '';

export default async function setup(): Promise<() => Promise<void>> {
  pgBin = findPgBin();
  const postgrestBin = findPostgrest();

  dataDir = mkdtempSync(join(tmpdir(), 'our-money-pg-'));
  const socketDir = join(dataDir, 'sock');
  mkdirSync(socketDir);
  if (process.getuid?.() === 0) execFileSync('chown', ['-R', 'postgres:postgres', dataDir]);
  chmodSync(dataDir, 0o700);

  const pgPort = await freePort();
  run(join(pgBin, 'initdb'), ['-D', join(dataDir, 'data'), '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  run(join(pgBin, 'pg_ctl'), [
    '-D',
    join(dataDir, 'data'),
    '-l',
    join(dataDir, 'postgres.log'),
    '-o',
    `-p ${pgPort} -k ${socketDir} -c listen_addresses=127.0.0.1 -c fsync=off`,
    '-w',
    'start',
  ]);

  const psql = (sql: string) =>
    execFileSync(join(pgBin, 'psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

  psql(ROLES_SQL);
  const migrationsDir = join(ROOT, 'supabase', 'migrations');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      psql(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      throw new Error(`Migration ${file} failed:\n${stderr}`);
    }
  }
  psql(GRANTS_SQL);

  const postgrestPort = await freePort();
  postgrest = spawn(postgrestBin, [], {
    env: {
      ...process.env,
      PGRST_DB_URI: `postgres://authenticator:authenticator@127.0.0.1:${pgPort}/postgres`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_SERVER_PORT: String(postgrestPort),
      PGRST_LOG_LEVEL: 'crit',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitFor(`http://127.0.0.1:${postgrestPort}/`);

  // supabase-js calls <url>/rest/v1/<table>; PostgREST serves /<table>.
  proxy = createServer((req, res) => {
    const path = (req.url ?? '/').replace(/^\/rest\/v1/, '') || '/';
    const upstream = httpRequest(
      { host: '127.0.0.1', port: postgrestPort, path, method: req.method, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      res.writeHead(502);
      res.end(String(error));
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy!.listen(0, '127.0.0.1', resolve));
  const proxyPort = (proxy.address() as AddressInfo).port;

  // Workers inherit this environment.
  process.env.SUPABASE_URL = `http://127.0.0.1:${proxyPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = signJwt({ role: 'service_role', iss: 'integration-tests' });
  process.env.TEST_PG_PORT = String(pgPort);
  process.env.TEST_PG_BIN = pgBin;
  process.env.APP_SESSION_SECRET = 'integration-session-secret';
  process.env.APP_BASE_URL = 'https://our-money.test';
  process.env.CRON_SECRET = 'integration-cron-secret';
  process.env.TELEGRAM_BOT_TOKEN = 'integration-bot-token';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'integration-webhook-secret';
  process.env.TELEGRAM_ALLOWED_USER_IDS = '111,222';
  process.env.ANTHROPIC_API_KEY = 'integration-anthropic-key';
  process.env.OPENAI_API_KEY = 'integration-openai-key';
  process.env.RISEUP_PAT = 'integration-riseup-pat';

  return async () => {
    postgrest?.kill('SIGTERM');
    await new Promise<void>((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
    try {
      run(join(pgBin, 'pg_ctl'), ['-D', join(dataDir, 'data'), '-m', 'immediate', '-w', 'stop']);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}
