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
let client: ClickHouseClient | null = null;
let connectionPromise: Promise<ClickHouseClient> | null = null;
let hooksInstalled = false;

function readConfig(): ClickhouseConfig {
  const raw = process.env.CLICKHOUSE_CONFIG;
  if (!raw) throw new Error("Missing env CLICKHOUSE_CONFIG");

  const cfg = JSON.parse(raw) as Partial<ClickhouseConfig>;

  if (
    !cfg.host ||
    !cfg.port ||
    !cfg.database ||
    !cfg.username ||
    !cfg.password
  ) {
    throw new Error(
      'CLICKHOUSE_CONFIG must include "host","port","database","username","password".',
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
  return `http://${cfg.host}:${cfg.port}`;
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
  process.once("uncaughtException", () => {
    void cleanup().then(() => process.exit(1));
  });
  process.once("unhandledRejection", () => {
    void cleanup().then(() => process.exit(1));
  });
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

export async function queryClickhouse<T extends Row>(
  sql: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const c = await connectClickhouse();
  const rs = await c.query({
    query: sql,
    query_params: params,
    format: "JSONEachRow",
  });
  return rs.json<T>();
}

export async function disconnectClickhouse() {
  if (!client) return;
  try {
    await client.close();
  } finally {
    client = null;
    connectionPromise = null;
  }
}
