import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints (NEAR_RPC, ...) into process.env for the sdk

// NEAR JSON-RPC view call. The sdk rotates over `NEAR_RPC` (comma separated), retries
// transient failures with exponential backoff and caps concurrency.

/**
 * Perform a NEAR JSON-RPC view (`call_function`) call with retry, endpoint failover, and concurrency limiting.
 * @param account - The NEAR account ID (contract) to call.
 * @param method - The view method name.
 * @param args - Optional JSON-serializable arguments (default: {}).
 * @returns Parsed JSON result returned by the contract method.
 */
export async function nearView(account: string, method: string, args: any = {}): Promise<any> {
  return sdk.chains.near.call({ contract: account, method, args });
}
