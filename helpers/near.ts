import plimit from "p-limit";
import { postURL } from "../utils/fetchURL";
import { sleep } from "../utils/utils";
import { getEnv } from "./env";

// NEAR JSON-RPC view call with retry, endpoint failover, and concurrency cap.

const RPCS = getEnv("NEAR_RPC").split(",");

// Cap concurrent calls to stay under rate limits.
const limit = plimit(3);
let rpcCursor = 0;

/**
 * Perform a NEAR JSON-RPC view (`call_function`) call with retry, endpoint failover, and concurrency limiting.
 * @param account - The NEAR account ID (contract) to call.
 * @param method - The view method name.
 * @param args - Optional JSON-serializable arguments (default: {}).
 * @returns Parsed JSON result returned by the contract method.
 */
export async function nearView(account: string, method: string, args: any = {}): Promise<any> {
  const payload = {
    jsonrpc: "2.0",
    id: "dimension-adapters",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: account,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    },
  };
  return limit(async () => {
    let lastErr: any;
    for (let attempt = 0; attempt < 8; attempt++) {
      // Round-robin across endpoints.
      const rpc = RPCS[rpcCursor++ % RPCS.length];
      try {
        const body = await postURL(rpc, payload, 0);
        if (body?.error) throw new Error(`${account}.${method}: ${JSON.stringify(body.error)}`);
        if (body?.result?.error) throw new Error(`${account}.${method}: ${body.result.error}`);
        if (!Array.isArray(body?.result?.result)) throw new Error(`${account}.${method}: unexpected response shape`);
        return JSON.parse(Buffer.from(body.result.result).toString());
      } catch (e: any) {
        lastErr = e;
        const status = e?.statusCode || e?.response?.status;
        const retryable = status === 429 || status === 503 || /429|503|timeout|socket|ECONN|ETIMEDOUT/i.test(e?.message ?? "");
        if (!retryable) throw e;
        await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 300));
      }
    }
    throw lastErr;
  });
}
