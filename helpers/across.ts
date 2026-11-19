import PromisePool from "@supercharge/promise-pool";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { getBlock } from "./getBlock";
import { solanaRpc } from "./solana";
import { httpGet } from "../utils/fetchURL";

// Shared Across deposit scan, used by bridges/across.ts and fees/across.ts.
// Across indexer API: https://docs.across.to/reference/api-reference
// `/deposits` filters on the origin chain's deposit block only (destination-chain block ranges return
// nothing and timestamp params are rejected), so every origin chain is read once per window in
// prefetch and each chain then slices the shared list: deposits leaving it and fills arriving on it.
// Fills are attributed by their deposit's time, not the fill time; fills land within minutes so the
// difference only shifts the hour boundary.
// `limit` is capped at 1000 and `skip` silently drops rows past the second page, so a block range that
// comes back full is split in half and re-queried rather than paged.
const API = "https://app.across.to/api/deposits";
const PAGE = 1000;
const SPLIT_THRESHOLD = 900; // a page this full may be truncated, split the range instead of trusting it
const MAX_DEPTH = 16;

// SpokePool chains. Every chain is scanned as an origin and sliced for incoming fills.
// start: two days after block 1, for chains younger than the oldest Across history. No deposit can predate its chain,
// and around genesis getBlock cannot resolve a range, which failed the whole prefetch for every chain.
// deadFrom: Across no longer serves the chain; the runner and prefetch both skip it from then on.
export const acrossChains: Record<string, { chainId: number; start?: string; deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1 },
  [CHAIN.OPTIMISM]: { chainId: 10 },
  [CHAIN.BSC]: { chainId: 56 },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2024-11-06" },
  [CHAIN.POLYGON]: { chainId: 137 },
  [CHAIN.LENS]: { chainId: 232, start: "2025-02-23" },
  [CHAIN.ERA]: { chainId: 324, start: "2023-02-16" },
  [CHAIN.WC]: { chainId: 480, start: "2024-06-27" },
  [CHAIN.REDSTONE]: { chainId: 690, start: "2024-04-05", deadFrom: "2025-12-10" }, // last Across deposit from Redstone was 2025-12-09
  [CHAIN.LISK]: { chainId: 1135, start: "2024-05-05", deadFrom: "2026-08-18" }, // last Across deposit from or to Lisk was 2026-08-17
  [CHAIN.SONEIUM]: { chainId: 1868, start: "2024-12-04" },
  [CHAIN.BASE]: { chainId: 8453, start: "2023-06-17" },
  [CHAIN.MODE]: { chainId: 34443, start: "2023-11-18" },
  [CHAIN.ARBITRUM]: { chainId: 42161 },
  [CHAIN.INK]: { chainId: 57073, start: "2024-12-08" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2023-07-08" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2024-02-26", deadFrom: "2026-08-01" }, // last Across deposit from or to Blast was 2026-07-31
  [CHAIN.SCROLL]: { chainId: 534352, start: "2023-10-12" },
  [CHAIN.ZORA]: { chainId: 7777777, start: "2023-06-15" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-05-16" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-02-20" },
  [CHAIN.PLASMA]: { chainId: 9745, start: "2025-09-05" },
  [CHAIN.TEMPO]: { chainId: 4217, start: "2026-01-18" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-05-02" },
  [CHAIN.MEGAETH]: { chainId: 4326, start: "2025-11-12" },
  [CHAIN.ARC]: { chainId: 5042, start: "2026-05-17" },
  [CHAIN.TRON]: { chainId: 728126428 },
  [CHAIN.SOLANA]: { chainId: 34268394551451 },
};

export type AcrossDeposit = {
  id: number;
  originChainId: number;
  destinationChainId: number | null;
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  outputAmount: string;
  status: string;
  bridgeFeeUsd?: string | number | null;
  depositBlockTimestamp?: string;
};

const toUnix = (iso?: string) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : NaN);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the API throttles sustained paging (429) and returns sporadic 5xx; back off instead of failing the whole window
async function getPage(url: string, attempt = 0): Promise<AcrossDeposit[]> {
  try {
    return await httpGet(url);
  } catch (e: any) {
    const status = Number(e?.response?.status ?? String(e?.message).match(/status code (\d{3})/)?.[1]);
    const retryable = status === 429 || status >= 500;
    if (!retryable || attempt >= 5) throw e;
    console.log(`across: HTTP ${status}, retry ${attempt + 1}/5 for ${url}`);
    await sleep(2000 * 2 ** attempt);
    return getPage(url, attempt + 1);
  }
}

async function fetchBlockRange(chain: string, fromBlock: number, toBlock: number, depth = 0): Promise<AcrossDeposit[]> {
  const rows = await getPage(`${API}?originChainId=${acrossChains[chain].chainId}&startBlock=${fromBlock}&endBlock=${toBlock}&limit=${PAGE}`);
  if (!Array.isArray(rows)) throw new Error(`across: unexpected response for ${chain}: ${JSON.stringify(rows).slice(0, 200)}`);
  if (rows.length < SPLIT_THRESHOLD) return rows;

  if (fromBlock === toBlock || depth >= MAX_DEPTH) throw new Error(`across: ${rows.length} deposits on ${chain} in blocks ${fromBlock}-${toBlock}, cannot split further`);
  const mid = Math.floor((fromBlock + toBlock) / 2);
  const left = await fetchBlockRange(chain, fromBlock, mid, depth + 1);
  const right = await fetchBlockRange(chain, mid + 1, toBlock, depth + 1);
  return [...left, ...right];
}

// getBlock does not cover Solana, where the API's startBlock/endBlock are slots. Secant search from the
// latest finalized slot, measuring the slot rate between the last two points (it drifts from the nominal
// 400ms), until the slot's block time is within SLOT_TOLERANCE of the target.
const SLOT_TOLERANCE = 30;
const SLOT_MARGIN = 300; // 1-2 minutes of slots on each side, the result is trimmed by deposit time anyway

async function getSlotTime(slot: number): Promise<number> {
  for (let s = slot; s < slot + 50; s++) {
    const time = await solanaRpc("getBlockTime", [s]);
    if (time != null) return time; // skipped slots have no block time, use the next produced one
  }
  throw new Error(`across: no Solana block time around slot ${slot}`);
}

async function getSolanaSlot(timestamp: number): Promise<number> {
  const latest: number = await solanaRpc("getSlot", [{ commitment: "finalized" }]);
  let prev = { slot: latest - 100_000, time: await getSlotTime(latest - 100_000) };
  let curr = { slot: latest, time: await getSlotTime(latest) };
  if (timestamp >= curr.time) return latest;
  for (let i = 0; i < 10; i++) {
    const diff = timestamp - curr.time;
    if (Math.abs(diff) <= SLOT_TOLERANCE) return curr.slot;
    const secondsPerSlot = (curr.time - prev.time) / (curr.slot - prev.slot) || 0.4;
    const slot = Math.min(latest, curr.slot + Math.round(diff / secondsPerSlot));
    prev = curr;
    curr = { slot, time: await getSlotTime(slot) };
  }
  throw new Error(`across: could not resolve a Solana slot for ${timestamp}`);
}

// Redstone's public RPC is gone. It is an OP Stack chain with exact 2s blocks, so block = (time - genesis) / 2;
// every Across deposit from Redstone checked (2024-10 to 2025-12) satisfies this with genesis 1712185091.
const REDSTONE_GENESIS = 1712185091;

async function getBlockRange(chain: string, options: FetchOptions): Promise<[number | null, number | null]> {
  if (chain === CHAIN.REDSTONE)
    return [Math.floor((options.fromTimestamp - REDSTONE_GENESIS) / 2), Math.ceil((options.toTimestamp - REDSTONE_GENESIS) / 2)];
  if (chain === CHAIN.SOLANA) {
    const fromSlot = await getSolanaSlot(options.fromTimestamp);
    const toSlot = await getSolanaSlot(options.toTimestamp);
    return [fromSlot - SLOT_MARGIN, toSlot + SLOT_MARGIN];
  }
  return [await getBlock(options.fromTimestamp, chain as any), await getBlock(options.toTimestamp, chain as any)];
}

async function fetchOriginDeposits(chain: string, options: FetchOptions): Promise<AcrossDeposit[]> {
  const [fromBlock, toBlock] = await getBlockRange(chain, options);
  if (!fromBlock || !toBlock) throw new Error(`across: could not resolve blocks for ${chain}`);

  const deposits = await fetchBlockRange(chain, fromBlock, toBlock);

  // the block range is inclusive and block timestamps are coarser than the window, so trim to the half-open window
  return deposits.filter((d) => {
    const ts = toUnix(d.depositBlockTimestamp);
    return ts >= options.startTimestamp && ts < options.endTimestamp;
  });
}

// a few origins at a time; the block range splits within one origin stay sequential
export const prefetchAcrossDeposits = async (options: FetchOptions): Promise<AcrossDeposit[]> => {
  const activeChains = Object.entries(acrossChains)
    .filter(([_, { start, deadFrom }]) => (!start || options.dateString >= start) && (!deadFrom || options.dateString < deadFrom))
    .map(([chain]) => chain);
  const { results, errors } = await PromisePool.withConcurrency(3)
    .for(activeChains)
    .process((chain) => fetchOriginDeposits(chain, options));
  if (errors.length) throw errors[0];
  return results.flat();
};
