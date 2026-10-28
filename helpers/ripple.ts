import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints / keys into process.env for the sdk

// XRPL JSON-RPC call. Endpoints from `XRPL_RPC` (comma separated); the sdk rotates over them and
// retries transient errors. Returns `{ result }` like the raw node body did, throws on `status: 'error'`.
export async function rpcCall(method: string, params: Array<any>): Promise<any> {
  const result = await sdk.chains.xrpl.rpc(method, params?.[0] ?? {})
  return { result }
}
