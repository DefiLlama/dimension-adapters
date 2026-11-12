import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import {
  AleoTransition,
  AleoValue,
  aleoBigInt,
  aleoBool,
  aleoNumber,
  firstPublicOutput,
  futureArguments,
  getAleoMappingValue,
  getAleoProgramCallsSince,
  getAleoTransactionTransitions,
  parseAleoPlaintext,
} from "../../helpers/aleo";

// https://shield.fi/docs/confidentiality/public-data
const AMM = "shield_swap.aleo";
const PRICING_TERMS = "shield_swap_pricing_terms.aleo";
const ROUTER = "shield_swap_router.aleo";

const START = "2026-07-30";

const SWAP = "swap";
const SWAP_MULTI_HOP = "swap_multi_hop";
const CLAIM = "claim_swap_output";
const CLAIM_NO_REFUND = "claim_swap_output_no_refund";
const SET_FEE_PROTOCOL = "set_fee_protocol";
const SWAPS = new Set([SWAP, SWAP_MULTI_HOP]);
const CLAIMS = new Set([CLAIM, CLAIM_NO_REFUND]);

const RECEIPTS_FROM_BLOCK = 21_031_954;

//https://shield.fi/docs/reference/constants-and-limits
const FEE_PPM_DENOMINATOR = 1e6;
const PROTOCOL_FEE_DENOMINATOR = 16;
const DEFAULT_FEE_PROTOCOL = 5n;

const BPS_DENOMINATOR = 10_000n;

const CLAIM_LAG_SECONDS = 30 * 60;

const CONCURRENCY = 3;

const POLICY_FEES = "Router Policy Fees";
const POLICY_FEES_TO_PROTOCOL = "Router Policy Fees To Protocol";

// key: token program name as field, decimals: the program's decimals view
const TOKENS: Record<string, { symbol: string; decimals: number; coingeckoId: string }> = {
  "724721105858008932013114020280511843613117371369744086165619field": { symbol: "ALEO", decimals: 6, coingeckoId: "aleo" },
  "1926848598207449231969field": { symbol: "ETH", decimals: 18, coingeckoId: "ethereum" },
  "2000279227181771747937field": { symbol: "SOL", decimals: 9, coingeckoId: "solana" },
  "469661199361043738096225field": { symbol: "wBTC", decimals: 8, coingeckoId: "bitcoin" },
  "212707628815602939926313406778312270053663804591730917421274098438979020915field": { symbol: "USDCx", decimals: 6, coingeckoId: "usd-coin" },
  "2679721602684747572764973622859521753039207964435861502200550930344051field": { symbol: "ZEC", decimals: 8, coingeckoId: "zcash" },
  "713588027583982631467445712611156256175541402545323992902004380759844979field": { symbol: "USDG", decimals: 6, coingeckoId: "global-dollar" },
};

type Struct = { [key: string]: AleoValue };

interface Hop {
  pool: string;
  zeroForOne: boolean;
}

interface Pool {
  token0: string;
  token1: string;
  creationFeePpm: bigint;
}

interface Swap {
  id: string;
  block: number;
  amountIn: bigint;
  hops: Hop[];
  transitions: AleoTransition[]; // every transition of the swap's transaction, for the policy fee
}

/** One executed hop, as written to the swap's permanent receipt. */
interface Execution extends Hop {
  amountIn: bigint;
  fees: bigint;
  protocolFees: bigint;
}

interface SplitChange {
  block: number;
  pool: string;
  feeProtocol: bigint;
}

function struct(value: AleoValue | undefined): Struct {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("shield-swap: expected an Aleo struct");
  return value;
}

function literal(value: AleoValue): string {
  if (typeof value !== "string") throw new Error("shield-swap: expected an Aleo literal");
  return value;
}

function parseHop(value: AleoValue): Hop {
  const hop = struct(value);
  return { pool: literal(hop.pool), zeroForOne: aleoBool(hop.zero_for_one) };
}

function parseSwap(transition: AleoTransition, block: number, transitions: AleoTransition[]): Swap {
  const request = struct(futureArguments(transition)[0]);
  const hopCount = transition.function === SWAP ? 1 : aleoNumber(request.hop_count);
  if (hopCount < 1 || hopCount > 3 || (transition.function === SWAP_MULTI_HOP && hopCount < 2))
    throw new Error("shield-swap: invalid hop count");
  return {
    id: firstPublicOutput(transition),
    block,
    amountIn: aleoBigInt(request.amount_in),
    hops: hopCount === 1
      ? [parseHop(request)]
      : Array.from({ length: hopCount }, (_, i) => parseHop(request[`hop${i}`])),
    transitions,
  };
}

async function readReceipt(swap: Swap): Promise<Execution[] | null> {
  if (swap.block < RECEIPTS_FROM_BLOCK) return null;
  const raw = await getAleoMappingValue(AMM, "swap_execution_headers", swap.id);
  if (!raw) {
    // Swaps earlier in the upgrade block than the deployment ran on edition 0 and have no receipt.
    if (swap.block === RECEIPTS_FROM_BLOCK) return null;
    throw new Error(`shield-swap: missing execution receipt for ${swap.id}`);
  }
  const header = struct(parseAleoPlaintext(raw));
  if (aleoNumber(header.hop_count) !== swap.hops.length || aleoNumber(header.executed_height) !== swap.block)
    throw new Error(`shield-swap: inconsistent execution header for ${swap.id}`);

  const hops: Execution[] = [];
  // Hops are read one after another so the request budget stays at CONCURRENCY swaps in flight,
  // rather than being multiplied by the hop count.
  for (const [i, expected] of swap.hops.entries()) {
    const rawHop = await getAleoMappingValue(AMM, "swap_execution_hops", `{ swap_id: ${swap.id}, hop_index: ${i}u8 }`);
    if (!rawHop) throw new Error(`shield-swap: missing hop ${i} of ${swap.id}`);
    const value = struct(parseAleoPlaintext(rawHop));
    const hop = parseHop(value);
    const amountIn = aleoBigInt(value.amount_in);
    const fees = aleoBigInt(value.fee_paid);
    const protocolFees = aleoBigInt(value.protocol_fee);
    if (hop.pool !== expected.pool || hop.zeroForOne !== expected.zeroForOne ||
      amountIn < 0n || fees < 0n || protocolFees < 0n || protocolFees > fees || fees > amountIn)
      throw new Error(`shield-swap: inconsistent hop ${i} of ${swap.id}`);
    hops.push({ ...hop, amountIn, fees, protocolFees });
  }
  return hops;
}

function policyFee(swap: Swap): bigint {
  const authorizations = swap.transitions.filter((t) =>
    t.program === PRICING_TERMS && t.function === "authorize_policy" && t.inputs[0]?.value === swap.id);
  if (!authorizations.length) {
    const policyRoute = swap.transitions.some((t) => t.program === ROUTER &&
      (t.function.endsWith("_with_policy") || t.function.endsWith("_terms_and_policy")) &&
      t.outputs.some((o) => o.type === "public" && o.value === swap.id));
    if (policyRoute) throw new Error(`shield-swap: missing policy authorization for ${swap.id}`);
    return 0n;
  }
  if (authorizations.length !== 1) throw new Error(`shield-swap: duplicate policy authorization for ${swap.id}`);
  const inputs = authorizations[0].inputs;
  if (inputs.length !== 3 || inputs.some((i) => i.type !== "public" || !i.value))
    throw new Error(`shield-swap: malformed policy authorization for ${swap.id}`);
  const bps = aleoBigInt(inputs[2].value!);
  if (inputs[1].value !== swap.hops[0].pool || bps < 0n || bps >= BPS_DENOMINATOR)
    throw new Error(`shield-swap: invalid policy authorization for ${swap.id}`);
  return swap.amountIn * bps / BPS_DENOMINATOR;
}

/** Base units to a whole-token amount, keeping full precision until the final conversion. */
function tokenAmount(tokenId: string, amount: bigint) {
  const token = TOKENS[tokenId];
  if (!token) throw new Error(`shield-swap: no price feed for token ${tokenId}`);
  if (amount < 0n) throw new Error(`shield-swap: invalid ${token.symbol} amount ${amount}`);
  const digits = amount.toString().padStart(token.decimals + 1, "0");
  // The SDK takes a whole-token number for CoinGecko balances, so convert only after scaling.
  const value = Number(`${digits.slice(0, -token.decimals)}.${digits.slice(-token.decimals)}`);
  if (!Number.isFinite(value)) throw new Error(`shield-swap: invalid ${token.symbol} amount ${amount}`);
  return { token: token.coingeckoId, value };
}

const poolCache: Record<string, Promise<Pool>> = {};

function loadPool(key: string): Promise<Pool> {
  if (!poolCache[key])
    poolCache[key] = (async () => {
      const raw = await getAleoMappingValue(AMM, "pools", key);
      if (!raw) throw new Error(`shield-swap: missing pool ${key}`);
      const pool = struct(parseAleoPlaintext(raw));
      return { token0: literal(pool.token0), token1: literal(pool.token1), creationFeePpm: aleoBigInt(pool.fee) };
    })().catch((e) => {
      delete poolCache[key];
      throw e;
    });
  return poolCache[key];
}

let splitChangesCache: Promise<SplitChange[]> | undefined;

function loadSplitChanges(): Promise<SplitChange[]> {
  if (!splitChangesCache)
    splitChangesCache = (async () => {
      const history = await getAleoProgramCallsSince(AMM, Date.parse(START) / 1000);
      const setters = history.filter((c) =>
        c.status === "Accepted" && c.function_id === SET_FEE_PROTOCOL && c.block_number <= RECEIPTS_FROM_BLOCK);
      const txs = await getAleoTransactionTransitions([...new Set(setters.map((c) => c.transaction_id))]);
      return setters
        .flatMap((c) => txs[c.transaction_id]
          .filter((t) => t.program === AMM && t.function === SET_FEE_PROTOCOL)
          // set_fee_protocol finalize arguments: (caller, pool, fee_protocol)
          .map((t) => {
            const args = futureArguments(t);
            return { block: c.block_number, pool: literal(args[1]), feeProtocol: aleoBigInt(args[2]) };
          }))
        .sort((a, b) => a.block - b.block);
    })().catch((e) => {
      splitChangesCache = undefined;
      throw e;
    });
  return splitChangesCache;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const calls = (await getAleoProgramCallsSince(AMM, options.fromTimestamp)).filter((c) => c.status === "Accepted");
  const swapCalls = calls.filter((c) =>
    SWAPS.has(c.function_id) && c.block_timestamp >= options.startTimestamp && c.block_timestamp < options.endTimestamp);
  const blockOf = new Map(swapCalls.map((c) => [c.transaction_id, c.block_number]));
  const ids = [...blockOf.keys()];
  const transitions = await getAleoTransactionTransitions(ids);

  const swaps = ids.flatMap((id) => {
    const txTransitions = transitions[id];
    const ownSwaps = txTransitions?.filter((t) => t.program === AMM && SWAPS.has(t.function));
    // The call list said this transaction swaps, so no swap transition means an unreadable transaction.
    if (!ownSwaps?.length) throw new Error(`shield-swap: no swap transition in ${id}`);
    const parsed = ownSwaps.map((t) => parseSwap(t, blockOf.get(id)!, txTransitions));
    for (const t of txTransitions.filter((t) => t.program === PRICING_TERMS && t.function === "authorize_policy")) {
      if (!parsed.some((s) => s.id === t.inputs[0]?.value))
        throw new Error(`shield-swap: policy authorization has no matching swap in ${id}`);
    }
    return parsed;
  });
  if (new Set(swaps.map((s) => s.id)).size !== swaps.length) throw new Error("shield-swap: duplicate swap ID");

  const executions = new Map<string, Execution[]>();
  const receiptReads = await PromisePool.withConcurrency(CONCURRENCY)
    .for(swaps)
    .process(async (swap) => {
      const hops = await readReceipt(swap);
      if (hops) executions.set(swap.id, hops);
    });
  if (receiptReads.errors.length) throw receiptReads.errors[0];

  const poolKeys = [...new Set(swaps.flatMap((s) => s.hops.map((h) => h.pool)))];
  const poolReads = await PromisePool.withConcurrency(CONCURRENCY)
    .for(poolKeys.filter((key) => !poolCache[key]))
    .process(async (key) => {
      await loadPool(key);
    });
  if (poolReads.errors.length) throw poolReads.errors[0];
  const pools = new Map(await Promise.all(poolKeys.map(async (key) => [key, await loadPool(key)] as const)));
  const inputToken = (hop: Hop) => {
    const pool = pools.get(hop.pool)!;
    return hop.zeroForOne ? pool.token0 : pool.token1;
  };

  // Swaps since edition 1: exact amounts from the permanent receipts, plus any router policy fee.
  for (const swap of swaps) {
    const hops = executions.get(swap.id);
    if (!hops) continue;
    for (const hop of hops) {
      const tokenId = inputToken(hop);
      const volume = tokenAmount(tokenId, hop.amountIn);
      const fees = tokenAmount(tokenId, hop.fees);
      const protocolFees = tokenAmount(tokenId, hop.protocolFees);
      const lpFees = tokenAmount(tokenId, hop.fees - hop.protocolFees);
      dailyVolume.addCGToken(volume.token, volume.value);
      dailyFees.addCGToken(fees.token, fees.value, METRIC.SWAP_FEES);
      dailyRevenue.addCGToken(protocolFees.token, protocolFees.value, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.addCGToken(lpFees.token, lpFees.value, METRIC.LP_FEES);
    }
    const policy = policyFee(swap);
    if (policy > 0n) {
      const charge = tokenAmount(inputToken(swap.hops[0]), policy);
      dailyFees.addCGToken(charge.token, charge.value, POLICY_FEES);
      dailyRevenue.addCGToken(charge.token, charge.value, POLICY_FEES_TO_PROTOCOL);
    }
  }

  const legacy = swaps.filter((s) => !executions.has(s.id));
  if (legacy.length) {
    const claimCalls = calls.filter((c) => CLAIMS.has(c.function_id) &&
      c.block_timestamp >= options.startTimestamp && c.block_timestamp < options.endTimestamp + CLAIM_LAG_SECONDS);
    const [claimTxs, splitChanges] = await Promise.all([
      getAleoTransactionTransitions([...new Set(claimCalls.map((c) => c.transaction_id))]),
      loadSplitChanges(),
    ]);
    const refunds = new Map<string, bigint>();
    for (const call of claimCalls) {
      const claims = claimTxs[call.transaction_id].filter((t) => t.program === AMM && CLAIMS.has(t.function));
      if (!claims.length) throw new Error(`shield-swap: no claim transition in ${call.transaction_id}`);
      for (const t of claims) {
        // claim_swap_output(swap_id, token_in, token_out, amount_out, amount_remaining, ...), the
        // remainder is in token_in; claim_swap_output_no_refund has no remainder.
        const args = futureArguments(t);
        refunds.set(literal(args[0]), t.function === CLAIM ? aleoBigInt(args[4]) : 0n);
      }
    }

    for (const swap of legacy) {
      // An unclaimed swap has no published refund yet; partial fills are rare enough that treating
      // it as fully filled is the closest available estimate.
      const filled = swap.amountIn - (refunds.get(swap.id) ?? 0n);
      if (filled < 0n) throw new Error(`shield-swap: invalid legacy refund for ${swap.id}`);
      // Every pre-receipt pool was quoted against USDCx and intermediate hop amounts were not
      // recorded, so the entry leg's filled input sizes every hop of the route.
      const { token, value } = tokenAmount(inputToken(swap.hops[0]), filled);
      for (const hop of swap.hops) {
        let feeProtocol = DEFAULT_FEE_PROTOCOL;
        for (const change of splitChanges) {
          if (change.pool !== hop.pool || change.block > swap.block) continue;
          if (change.block === swap.block) throw new Error("shield-swap: legacy fee change needs transaction ordering");
          feeProtocol = change.feeProtocol;
        }
        const fees = value * Number(pools.get(hop.pool)!.creationFeePpm) / FEE_PPM_DENOMINATOR;
        const protocolFees = fees * Number(feeProtocol) / PROTOCOL_FEE_DENOMINATOR;
        dailyVolume.addCGToken(token, value);
        dailyFees.addCGToken(token, fees, METRIC.SWAP_FEES);
        dailyRevenue.addCGToken(token, protocolFees, METRIC.PROTOCOL_FEES);
        dailySupplySideRevenue.addCGToken(token, fees - protocolFees, METRIC.LP_FEES);
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Hourly: the Aleo RPC has no time or block filter, so reaching a window means paging back from
  // the head. Hourly windows keep that walk short, and the helper caches it across the windows of a
  // single run.
  pullHourly: true,
  fetch,
  chains: [CHAIN.ALEO],
  start: START,
  methodology: {
    Volume: "Value of tokens traded through Shield Swap pools, counted once for each pool a routed swap passes through. Before 12 Aug 2026, Shield recorded no per-swap results, so volume is the swap size minus any refunded input.",
    Fees: "Swap fees paid by traders on every pool a swap passes through, plus the router policy fee charged on some routed swaps. Before 12 Aug 2026, swap fees are estimated from each pool's fee tier.",
    UserFees: "Swap fees and router policy fees paid by traders.",
    Revenue: "The protocol's share of swap fees (5/16 by default, set per pool by Shield) plus the full router policy fee.",
    ProtocolRevenue: "The protocol's share of swap fees plus the full router policy fee, all kept by Shield; Shield Swap has no token, so nothing goes to holders.",
    SupplySideRevenue: "The rest of each swap fee, earned by the liquidity providers whose positions filled the swap. Router policy fees are not shared with liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fee paid on each pool a swap passes through, after any fee reduction. Estimated from the pool's fee tier before 12 Aug 2026.",
      [POLICY_FEES]: "Fee charged at Shield's policy rate on the trader's full input, on swaps routed through the router's policy routes.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fee paid by traders on each pool a swap passes through.",
      [POLICY_FEES]: "Router policy fee paid by traders on policy-routed swaps.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "The protocol's share of each swap fee (5/16 by default).",
      [POLICY_FEES_TO_PROTOCOL]: "The full router policy fee, added to the pool's protocol fee balance.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "The protocol's share of each swap fee (5/16 by default), kept by Shield.",
      [POLICY_FEES_TO_PROTOCOL]: "The full router policy fee, kept by Shield.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Swap fee minus the protocol's share, earned by liquidity providers.",
    },
  },
};

export default adapter;
