// Internet Computer query client: the CBOR / Candid / Principal codec and the transport
// (endpoint rotation over `ICP_RPC`, retries, `IcpRejectError` with `errorCode` / `rejectCode`)
// live in `sdk.chains.icp`; this file keeps the adapter-facing names.
import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints / keys into process.env for the sdk

const icp = sdk.chains.icp

export const hashCandidLabel = icp.hashCandidLabel
export const decodeCandid = icp.decodeCandid

/**
 * Call a zero-argument query method on an Internet Computer canister and return the raw Candid reply.
 * Throws on a replica reject, with `errorCode`/`rejectCode` attached so callers can distinguish a
 * permanently dead canister (`IC0537`, no Wasm module installed) from a transient failure.
 * @returns the raw `DIDL...` bytes, to be passed to {@link decodeCandid}
 */
export async function queryCanister({ canisterId, methodName, host, timeout }: {
  canisterId: string
  methodName: string
  host?: string
  timeout?: number
}): Promise<Uint8Array> {
  return icp.queryCanister({ canisterId, methodName, host, timeout })
}

/**
 * Query a zero-argument method and decode its reply in one step.
 * @param labels field names to resolve in the decoded records, e.g. `['vol24h', 'value1']`
 * @returns the first value of the reply tuple, `any` for the reason given on {@link decodeCandid}
 */
export async function queryCanisterDecoded(
  canisterId: string,
  methodName: string,
  labels: string[] = [],
): Promise<any> {
  return icp.queryCanisterDecoded(canisterId, methodName, labels)
}
