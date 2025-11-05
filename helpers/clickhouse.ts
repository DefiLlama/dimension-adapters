import { ClickHouseClient, createClient, Row } from "@clickhouse/client";

let client: ClickHouseClient | null = null;
let connectionPromise: Promise<ClickHouseClient> | null = null;
let hooksInstalled = false;

type ClickhouseConfig = {
  host: string;
  port: number | string;
  database: string;
  username: string;
  password: string;
};

const DEFAULT_TIMEOUT = 180_000;
const DEFAULT_MAX_CONN = 10;
const DEFAULT_KEEPALIVE_TTL = 180_000;

function readConfig(): ClickhouseConfig {
  const raw = process.env.CLICKHOUSE_CONFIG;
  if (!raw) throw new Error("Missing CLICKHOUSE_CONFIG.");

  const cfg = JSON.parse(raw) as Partial<ClickhouseConfig>;

  if (!cfg.host || !cfg.port || !cfg.database || !cfg.username || !cfg.password) {
    throw new Error('CLICKHOUSE_CONFIG must include "host","port","database","username","password".');
  }

  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    username: cfg.username,
    password: cfg.password,
  };
}

function buildUrl(cfg: ClickhouseConfig): string {
  return `http://${cfg.host}:${cfg.port}`;
}


function installShutdownHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  const cleanup = async () => { try { await disconnectClickhouse(); } catch {} };

  ["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => process.once(sig, () => { void cleanup().then(() => process.exit(0)) }));
  process.once("beforeExit", () => { void cleanup() });
  process.once("uncaughtException", () => { void cleanup().then(() => process.exit(1)) });
  process.once("unhandledRejection", () => { void cleanup().then(() => process.exit(1)) });
}

export async function connectClickhouse(): Promise<ClickHouseClient> {
  if (client) return client;
  if (connectionPromise) return connectionPromise;

  installShutdownHooks();

  connectionPromise = (async () => {
    const cfg = readConfig();
    const url = buildUrl(cfg);

    const _client = createClient({
      url,
      username: cfg.username,
      password: cfg.password,
      database: cfg.database,
      request_timeout: DEFAULT_TIMEOUT,
      max_open_connections: DEFAULT_MAX_CONN,
      keep_alive: { enabled: true, idle_socket_ttl: DEFAULT_KEEPALIVE_TTL },
      compression: { response: true, request: false },
    });

    await _client.ping();
    client = _client;
    return _client;
  })();

  return connectionPromise;
}

export async function queryClickhouse<T extends Row>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const c = await connectClickhouse();
  const rs = await c.query({ query: sql, query_params: params, format: "JSONEachRow" });
  return rs.json<T>();
}

export async function disconnectClickhouse() {
  if (!client) return;
  try { await client.close(); }
  finally { client = null; connectionPromise = null; }
}

