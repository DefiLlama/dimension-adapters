import { ClickHouseClient, createClient, Row } from "@clickhouse/client";
import { getEnv } from "./env";

let client: ClickHouseClient | null = null;
let connectionPromise: Promise<ClickHouseClient> | null = null;

const requiredVars = ["CLICKHOUSE_HOST","CLICKHOUSE_USERNAME","CLICKHOUSE_PASSWORD","CLICKHOUSE_PORT", "CLICKHOUSE_DATABASE"];

export async function connectClickhouse(): Promise<ClickHouseClient> {
  if (client) return client;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const missing = requiredVars.filter(v => !getEnv(v));
    if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

    const url = `http://${getEnv("CLICKHOUSE_HOST")}:${getEnv("CLICKHOUSE_PORT")}`;
    const database = getEnv("CLICKHOUSE_DATABASE");

    const _client = createClient({
      url,
      username: getEnv("CLICKHOUSE_USERNAME")!,
      password: getEnv("CLICKHOUSE_PASSWORD")!,
      database,
      keep_alive: { enabled: true, idle_socket_ttl: 180000 },
      compression: { response: true, request: false },
      max_open_connections: 10,
      request_timeout: 180000,
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
  try {
    const rs = await c.query({
      query: sql,
      query_params: params,
      format: "JSONEachRow",
    });
    return await rs.json<T>();
  } catch (error: any) {
    if (error?.code === "ECONNRESET" || error?.code === "ECONNREFUSED") {
      await disconnectClickhouse();
    }
    throw error;
  }
}

export async function disconnectClickhouse() {
  if (client) {
    await client.close();
    client = null;
  }
  connectionPromise = null;
}
