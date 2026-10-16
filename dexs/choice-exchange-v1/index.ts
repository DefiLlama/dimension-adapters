import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PromisePool } from "@supercharge/promise-pool";
import { httpGet } from "../../utils/fetchURL";

// Choice v1: terraswap-style CosmWasm AMM on Injective. Choice v2 (Injective EVM) is the separate choice-exchange listing.
// Source and addresses: https://github.com/choice-exchange/choice_exchange (deployed_contracts.md)
const FACTORY = "inj1k9lcqtn3y92h4t3tdsu7z8qx292mhxhgsssmxg";
// Fee split (contracts/choice_pair/src/contract.rs in the repo above): the commission is 0.3% of the swap output
// (COMMISSION_RATE = 3), of which 1/6 goes to the pair's fee wallet, 1/6 to its burn address (the Injective burn auction)
// and the rest stays in the pair for LPs. The swap event reports every amount, so they are read, not assumed.
// Fee wallet = Choice Treasury Multisig inj1c2yleauy9say73tsx3dk5tvlgwwzdh96r76zv4 (deployed_contracts.md);
// burn address = pair_info.burn_address, inj1yr7srge0lku4h3gd473qdlpdfw63ejdjwkh4c0 on the pairs checked.
// They are kept here so the adapter can be rebuilt if the explorer API disappears.
const LCDS = ["https://sentry.lcd.injective.network", "https://lcd.injective.network"];
// Injective explorer API (public indexer; the tendermint rpc keeps about a day of history, this keeps all of it).
// GET v2/contractTxs/{contract}?from=&to= (unix ms) lists the txs that involve a contract in that range, newest first,
// about 20 per page; paging.next holds the tokens of the following pages. Wide ranges time out, hourly windows do not.
const EXPLORERS = ["https://sentry.explorer.grpc-web.injective.network/api/explorer"];
const MAX_PAGES = 200;

const LABEL_SWAP_FEES = "Swap Fees";
const LABEL_TO_TREASURY = "Swap Fees To Treasury";
const LABEL_TO_BURN = "Swap Fees To Burn Auction";
const LABEL_TO_LPS = "Swap Fees To LPs";

type Balances = ReturnType<FetchOptions["createBalances"]>;
type AssetInfo = { native_token?: { denom: string }; token?: { contract_addr: string } };

// try each endpoint in order; if all fail the last error is thrown
async function withFallback<T>(urls: string[], call: (url: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await call(url);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// memoize a promise per key; a failed call is dropped so it can be retried
function memo<T>(cache: Map<string, Promise<T>>, key: string, call: () => Promise<T>): Promise<T> {
  let hit = cache.get(key);
  if (!hit) {
    hit = call().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, hit);
  }
  return hit;
}

const encode = (msg: Record<string, unknown>) => encodeURIComponent(Buffer.from(JSON.stringify(msg)).toString("base64"));

async function fetchPairs(): Promise<string[]> {
  const pairs: string[] = [];
  let startAfter: AssetInfo[] | undefined;
  while (true) {
    const q = encode({ pairs: { limit: 30, ...(startAfter && { start_after: startAfter }) } });
    const res = await withFallback(LCDS, (lcd) => httpGet(`${lcd}/cosmwasm/wasm/v1/contract/${FACTORY}/smart/${q}`));
    const page: { contract_addr: string; asset_infos: AssetInfo[] }[] = res.data.pairs;
    pairs.push(...page.map((p) => p.contract_addr));
    if (page.length < 30) break;
    startAfter = page[page.length - 1].asset_infos;
  }
  return pairs;
}

// pairs are only ever added (a pair created after the window has no swap in it), so one lookup per process is enough
const pairsCache = new Map<string, Promise<string[]>>();
const getPairs = () => memo(pairsCache, "pairs", fetchPairs);

// explorer timestamps look like "2026-10-15 23:02:30.363 +0000 UTC"
const txMs = (timestamp: string): number => {
  const ms = Date.parse(String(timestamp).replace(" +0000 UTC", "Z").replace(" ", "T"));
  if (Number.isNaN(ms)) throw new Error(`Choice v1: cannot parse explorer timestamp ${timestamp}`);
  return ms;
};

// time of the newest block the explorer has indexed: an indexer that lags must not turn into a stored 0
async function getIndexedUntilMs(): Promise<number> {
  const res = await withFallback(EXPLORERS, (base) => httpGet(`${base}/v1/blocks?limit=1`));
  const block = Array.isArray(res?.data) ? res.data[0] : undefined;
  if (!block?.timestamp) throw new Error("Choice v1: cannot read the latest indexed block from the explorer");
  return txMs(block.timestamp);
}

// swap events of one pair in [fromMs, toMs), read from the logs of the txs that involve the pair
async function getPairSwaps(pair: string, fromMs: number, toMs: number) {
  const swaps: Record<string, string>[] = [];
  const seen = new Set<string>();
  // the range is widened by a second and the exact window is applied below, so the api's edge handling does not matter
  const range = `from=${fromMs - 1000}&to=${toMs + 1000}`;
  let query = `${pair}?${range}`;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await withFallback(EXPLORERS, (base) => httpGet(`${base}/v2/contractTxs/${query}`));
    if (!res || typeof res !== "object" || !res.paging) throw new Error(`Choice v1: malformed explorer response for ${pair}`);
    const txs: any[] = res.data ?? []; // an empty range comes back without "data"
    let oldest = Infinity;
    for (const tx of txs) {
      const t = txMs(tx.block_timestamp);
      oldest = Math.min(oldest, t);
      if (t < fromMs || t >= toMs || seen.has(tx.hash)) continue;
      seen.add(tx.hash);
      if (Number(tx.code ?? 0) !== 0) continue; // failed tx
      if (!Array.isArray(tx.logs) || !tx.logs.length) throw new Error(`Choice v1: tx ${tx.hash} has no logs`);
      for (const log of tx.logs) {
        for (const event of log.events ?? []) {
          if (event.type !== "wasm") continue;
          const attrs: Record<string, string> = {};
          for (const { key, value } of event.attributes ?? []) attrs[key] = value;
          // a multi-hop tx has one wasm event per pair, keep only this pair's swap
          if (attrs._contract_address === pair && attrs.action === "swap") swaps.push(attrs);
        }
      }
    }
    const next = res.paging.next?.[0];
    if (!txs.length || !next || oldest < fromMs) return swaps;
    query = `${pair}?token=${encodeURIComponent(next)}&${range}`;
  }
  throw new Error(`Choice v1: more than ${MAX_PAGES} pages for ${pair} in one window`);
}

// "inj" is the native INJ denom; "erc20:0x.." is the bank form of an EVM token; cw20 contracts are used as-is
function addToken(balances: Balances, token: string, amount: bigint) {
  if (amount <= 0n) return;
  if (token === "inj") balances.addGasToken(amount.toString());
  else balances.add(token.replace(/^erc20:/, ""), amount.toString());
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swapFees = options.createBalances();
  const treasuryFees = options.createBalances();
  const burnFees = options.createBalances();

  // half-open window [startTimestamp, endTimestamp)
  const fromMs = options.startTimestamp * 1000;
  const toMs = options.endTimestamp * 1000;

  const indexedUntil = await getIndexedUntilMs();
  if (indexedUntil < toMs) {
    throw new Error(`Choice v1: explorer has only indexed until ${new Date(indexedUntil).toISOString()}, window ends ${new Date(toMs).toISOString()}`);
  }

  const pairs = await getPairs();
  await PromisePool.withConcurrency(3)
    .for(pairs)
    .process(async (pair) => {
      const swaps = await getPairSwaps(pair, fromMs, toMs);
      for (const s of swaps) {
        // volume is the offer side (gross of fee); the commission is charged on the ask asset
        addToken(dailyVolume, s.offer_asset, BigInt(s.offer_amount));
        addToken(swapFees, s.ask_asset, BigInt(s.commission_amount));
        addToken(treasuryFees, s.ask_asset, BigInt(s.fee_wallet_amount));
        addToken(burnFees, s.ask_asset, BigInt(s.burn_amount));
      }
    });

  const dailyFees = swapFees.clone(1, LABEL_SWAP_FEES);
  const dailyProtocolRevenue = treasuryFees.clone(1, LABEL_TO_TREASURY);
  const dailyRevenue = dailyProtocolRevenue.clone(1);
  dailyRevenue.addBalances(burnFees.clone(1, LABEL_TO_BURN));
  const dailySupplySideRevenue = swapFees.clone(1);
  dailySupplySideRevenue.subtract(treasuryFees);
  dailySupplySideRevenue.subtract(burnFees);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1),
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue.clone(1, LABEL_TO_LPS),
  };
};

const methodology = {
  Volume: "Value traded on Choice v1 liquidity pools on Injective, counted on the input side of each swap; Choice v2 pools are a separate listing.",
  Fees: "Swap fees paid by traders on Choice v1 pools, which is 0.3% of the swap output.",
  UserFees: "Swap fees paid by traders on Choice v1 pools, which is 0.3% of the swap output.",
  Revenue: "The third of the swap fees kept by the protocol: half goes to the Choice treasury multisig and half to the Injective burn auction.",
  ProtocolRevenue: "One sixth of each swap fee, sent to the Choice treasury multisig.",
  SupplySideRevenue: "Two thirds of each swap fee, which stays in the pool and goes to liquidity providers.",
};

const breakdownMethodology = {
  Fees: { [LABEL_SWAP_FEES]: "Swap fees paid by traders on Choice v1 pools." },
  Revenue: {
    [LABEL_TO_TREASURY]: "One sixth of each swap fee, sent to the Choice treasury multisig.",
    [LABEL_TO_BURN]: "One sixth of each swap fee, sent to the Injective burn auction.",
  },
  ProtocolRevenue: { [LABEL_TO_TREASURY]: "One sixth of each swap fee, sent to the Choice treasury multisig." },
  SupplySideRevenue: { [LABEL_TO_LPS]: "Two thirds of each swap fee, left in the pool for liquidity providers." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2025-06-15", // first day with a v1 swap (factory created 2025-06-15)
  methodology,
  breakdownMethodology,
};

export default adapter;
