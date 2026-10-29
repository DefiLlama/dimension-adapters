import { fetchURLAutoHandleRateLimit, httpGet } from "../utils/fetchURL";

const EXPLORER = "https://sentry.explorer.grpc-web.injective.network/api/explorer";
const MAX_PAGES = 200;

export const explorerTimeMs = (timestamp: string): number => {
  const ms = Date.parse(String(timestamp).replace(" +0000 UTC", "Z").replace(" ", "T"));
  if (Number.isNaN(ms)) throw new Error(`injective explorer: cannot parse timestamp ${timestamp}`);
  return ms;
};

export async function getExplorerIndexedUntilMs(): Promise<number> {
  const res = await httpGet(`${EXPLORER}/v1/blocks?limit=1`);
  const block = Array.isArray(res?.data) ? res.data[0] : undefined;
  if (!block?.timestamp) throw new Error("injective explorer: cannot read the latest indexed block");
  return explorerTimeMs(block.timestamp);
}

export async function getContractTxs(contract: string, fromMs: number, toMs: number): Promise<any[]> {
  const txs: any[] = [];
  const seen = new Set<string>();
  const range = `from=${fromMs - 1000}&to=${toMs + 1000}`;
  let query = `${contract}?${range}`;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchURLAutoHandleRateLimit(`${EXPLORER}/v2/contractTxs/${query}`);
    if (!res || typeof res !== "object" || !res.paging) throw new Error(`injective explorer: malformed contractTxs response for ${contract}`);
    const pageTxs: any[] = res.data ?? []; // an empty range comes back without "data"
    let oldest = Infinity;
    for (const tx of pageTxs) {
      const t = explorerTimeMs(tx.block_timestamp);
      oldest = Math.min(oldest, t);
      if (t < fromMs || t >= toMs || seen.has(tx.hash)) continue;
      seen.add(tx.hash);
      txs.push(tx);
    }
    const next = res.paging.next?.[0];
    if (!pageTxs.length || !next || oldest < fromMs) return txs;
    query = `${contract}?token=${encodeURIComponent(next)}&${range}`;
  }
  throw new Error(`injective explorer: more than ${MAX_PAGES} pages for ${contract} in one window`);
}

export function getContractWasmEvents(tx: any, contract: string): Record<string, string>[] {
  if (!Array.isArray(tx.logs) || !tx.logs.length) throw new Error(`injective explorer: tx ${tx.hash} has no logs`);
  const events: Record<string, string>[] = [];
  for (const log of tx.logs) {
    for (const event of log.events ?? []) {
      if (event.type !== "wasm") continue;
      let attrs: Record<string, string> | undefined;
      for (const { key, value } of event.attributes ?? []) {
        if (key === "_contract_address") {
          attrs = {};
          if (value === contract) events.push(attrs);
        }
        if (attrs) attrs[key] = value;
      }
    }
  }
  return events;
}
