import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { solanaRpc } from "../helpers/solana";
import { httpGet } from "../utils/fetchURL";

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

// SpokePool chain ids. Every chain is scanned as an origin and sliced for incoming fills.
const chainIds: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.POLYGON]: 137,
  [CHAIN.LENS]: 232,
  [CHAIN.ERA]: 324,
  [CHAIN.WC]: 480,
  // [CHAIN.REDSTONE]: 690, // no working public RPC for the block lookup; last Across deposit from Redstone was 2025-12-09
  [CHAIN.LISK]: 1135,
  [CHAIN.SONEIUM]: 1868,
  [CHAIN.BASE]: 8453,
  [CHAIN.MODE]: 34443,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.INK]: 57073,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BLAST]: 81457,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.ZORA]: 7777777,
  [CHAIN.MONAD]: 143,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.TEMPO]: 4217,
  [CHAIN.ROBINHOOD]: 4663,
  [CHAIN.MEGAETH]: 4326,
  [CHAIN.ARC]: 5042,
  [CHAIN.TRON]: 728126428,
  [CHAIN.SOLANA]: 34268394551451,
};

type AcrossDeposit = {
  originChainId: number;
  destinationChainId: number | null;
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  outputAmount: string;
  status: string;
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
  const rows = await getPage(`${API}?originChainId=${chainIds[chain]}&startBlock=${fromBlock}&endBlock=${toBlock}&limit=${PAGE}`);
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

async function getBlockRange(chain: string, options: FetchOptions): Promise<[number | null, number | null]> {
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
const prefetch = async (options: FetchOptions) => {
  const { results, errors } = await PromisePool.withConcurrency(3)
    .for(Object.keys(chainIds))
    .process((chain) => fetchOriginDeposits(chain, options));
  if (errors.length) throw errors[0];
  return results.flat();
};

const fetch = async (options: FetchOptions) => {
  const deposits = options.preFetchedResults as AcrossDeposit[];
  const chainId = chainIds[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const d of deposits) {
    if (d.originChainId === chainId && d.inputToken && d.inputAmount) {
      dailyOutgoingVolume.add(d.inputToken, d.inputAmount);
      dailyOutgoingTxCount++;
    }
    if (d.destinationChainId === chainId && d.status === "filled" && d.outputToken && d.outputAmount) {
      dailyIncomingVolume.add(d.outputToken, d.outputAmount);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  chains: Object.keys(chainIds),
  methodology: {
    OutgoingVolume: "USD value of deposits into the Across SpokePool on each chain, from the Across indexer API.",
    IncomingVolume: "USD value of filled relays delivered on each chain, attributed to the time of their deposit.",
    OutgoingTxCount: "Number of deposits initiated on each chain.",
    IncomingTxCount: "Number of filled relays delivered on each chain.",
  },
};

export default adapter;
