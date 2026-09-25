import { Sequelize } from "sequelize";
import { FetchOptions } from "../adapters/types";
import { getEnv } from "./env";
import { ClickHouseClient, createClient, Row } from "@clickhouse/client";

const dbString = getEnv("INDEXA_DB");

let connection: Sequelize;

// indexa
async function getConnection() {
  if (!dbString) throw new Error("INDEXA_DB not set");
  if (!connection)
    connection = new Sequelize(dbString, {
      logging: false,
      dialect: "postgres",
      pool: { max: 5, min: 0, acquire: 30000, idle: 5000 },
    });

  await connection.authenticate();
  return connection;
}

export async function queryIndexer(sql: string, options?: FetchOptions) {
  if (options) {
    const { fromTimestamp, toTimestamp } = options;
    const start = new Date(fromTimestamp * 1000).toISOString();
    const end = new Date(toTimestamp * 1000).toISOString();
    sql = sql.replace(
      /block_time BETWEEN llama_replace_date_range/g,
      `block_time BETWEEN '${start}' AND '${end}'`,
    );
  }
  // console.log('Querying indexer with:', sql)
  const conn = await getConnection();
  const results = await conn.query(sql);
  return results[0];
}

export async function closeConnection() {
  if (connection) {
    console.log("Closing connection to indexer");
    await connection.close();
    console.log("Connection closed");
  }
}

process.on("exit", closeConnection);
process.on("SIGINT", closeConnection);
process.on("SIGTERM", closeConnection);

export function toByteaArray(arr: string[], { skipBytea = false } = {}) {
  const res = arr.map(
    (wallet) =>
      "'" + wallet.replace("0x", "\\x") + (skipBytea ? "'" : "'::bytea"),
  );
  return `( ${res.join(", ")} )`;
}

// indexer v2
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
// Chains whose logs live on the v4 ClickHouse deployment; every other chain
// keeps using CLICKHOUSE_CONFIG so existing adapters are unaffected.
const CLICKHOUSE_V4_CHAINS = new Set(["robinhood"]);
const configEnvKeyForChain = (chain?: string) =>
  chain && CLICKHOUSE_V4_CHAINS.has(chain) ? "CLICKHOUSE_CONFIG_V4" : "CLICKHOUSE_CONFIG";

const clients: Record<string, ClickHouseClient> = {};
const connectionPromises: Record<string, Promise<ClickHouseClient> | undefined> = {};
let hooksInstalled = false;

function readConfig(envKey: string): ClickhouseConfig {
  const raw = process.env[envKey];
  if (!raw) throw new Error(`Missing env ${envKey}`);

  const cfg = JSON.parse(raw) as Partial<ClickhouseConfig>;

  if (
    !cfg.host ||
    !cfg.port ||
    !cfg.database ||
    !cfg.username ||
    !cfg.password
  ) {
    throw new Error(
      `${envKey} must include "host","port","database","username","password".`,
    );
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
  const host = String(cfg.host).replace(/\/+$/, "");
  return host.startsWith("http") ? `${host}:${cfg.port}` : `http://${host}:${cfg.port}`;
}

function installShutdownHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  const cleanup = async () => {
    try {
      await disconnectClickhouse();
    } catch {}
  };

  ["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) =>
    process.once(sig, () => {
      void cleanup().then(() => process.exit(0));
    }),
  );
  process.once("beforeExit", () => {
    void cleanup();
  });
  process.once("uncaughtException", (error, origin) => {
    console.error(`[Indexer] Uncaught exception (${origin}); closing connections and exiting:`, error.stack ?? error.message);
    void cleanup().then(() => process.exit(0));
  });
  process.once("unhandledRejection", (reason) => {
    console.error("[Indexer] Unhandled rejection; closing connections and exiting:", reason instanceof Error ? reason.stack ?? reason.message : reason);
    void cleanup().then(() => process.exit(0));
  });
}

export async function connectClickhouse(envKey = "CLICKHOUSE_CONFIG"): Promise<ClickHouseClient> {
  if (clients[envKey]) return clients[envKey];
  if (connectionPromises[envKey]) return connectionPromises[envKey]!;

  installShutdownHooks();

  connectionPromises[envKey] = (async () => {
    let _client: ClickHouseClient | null = null;
    try {
      const cfg = readConfig(envKey);
      const url = buildUrl(cfg);

      _client = createClient({
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
      clients[envKey] = _client;
      return _client;
    } catch (e) {
      connectionPromises[envKey] = undefined;
      delete clients[envKey];
      try { await _client?.close(); } catch {}
      throw e;
    }
  })();

  return connectionPromises[envKey]!;
}

export async function queryClickhouse<T extends Row>(
  sql: string,
  params?: Record<string, unknown>,
  settings?: Record<string, string | number>,
  opts?: { chain?: string },
): Promise<T[]> {
  const c = await connectClickhouse(configEnvKeyForChain(opts?.chain));
  const rs = await c.query({
    query: sql,
    query_params: params,
    format: "JSONEachRow",
    clickhouse_settings: settings as any,
  });
  return rs.json<T>();
}

export async function disconnectClickhouse() {
  const open = Object.keys(clients);
  for (const envKey of open) {
    const c = clients[envKey];
    delete clients[envKey];
    connectionPromises[envKey] = undefined;
    try { await c.close(); } catch { }
  }
}
