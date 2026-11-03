import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import {
  AleoTransition, AleoValue, aleoBigInt, aleoBool, aleoNumber, firstPublicOutput,
  futureArguments, getAleoMappingValue, getAleoProgramCallsSince,
  getAleoTransactionTransitions, parseAleoPlaintext,
} from "../../helpers/aleo";

const AMM = "shield_swap.aleo";
const PRICING_TERMS = "shield_swap_pricing_terms.aleo";
const ROUTER = "shield_swap_router.aleo";
const START = "2026-07-30";
// Edition 1 first writes permanent receipts. The deployment is in mainnet block 21031954.
const RECEIPTS_FROM_BLOCK = 21_031_954;
const CONCURRENCY = 3;
const SWAPS = new Set(["swap", "swap_multi_hop"]);
const CLAIMS = new Set(["claim_swap_output", "claim_swap_output_no_refund"]);
const CLAIM_LAG_SECONDS = 30 * 60;

// Aleo has no decimal registry. Bridged reference assets use their underlying CoinGecko prices.
const TOKENS: Record<string, { decimals: number; coingeckoId: string }> = {
  "724721105858008932013114020280511843613117371369744086165619field": { decimals: 6, coingeckoId: "aleo" },
  "1926848598207449231969field": { decimals: 18, coingeckoId: "ethereum" },
  "2000279227181771747937field": { decimals: 9, coingeckoId: "solana" },
  "469661199361043738096225field": { decimals: 8, coingeckoId: "bitcoin" },
  "212707628815602939926313406778312270053663804591730917421274098438979020915field": { decimals: 6, coingeckoId: "usd-coin" },
  "2679721602684747572764973622859521753039207964435861502200550930344051field": { decimals: 8, coingeckoId: "zcash" },
};

type Struct = { [key: string]: AleoValue };
interface Hop { pool: string; zeroForOne: boolean }
interface Pool { token0: string; token1: string; fee: bigint }
interface Swap { id: string; block: number; amountIn: bigint; hops: Hop[]; transitions: AleoTransition[] }
interface Execution extends Hop { amountIn: bigint; fees: bigint; revenue: bigint }

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
  const count = transition.function === "swap" ? 1 : aleoNumber(request.hop_count);
  if (count < 1 || count > 3 || (transition.function === "swap_multi_hop" && count < 2))
    throw new Error("shield-swap: invalid hop count");
  return {
    id: firstPublicOutput(transition), block, transitions,
    amountIn: aleoBigInt(request.amount_in),
    hops: count === 1 ? [parseHop(request)] : Array.from({ length: count }, (_, i) => parseHop(request[`hop${i}`])),
  };
}

async function receipt(swap: Swap): Promise<Execution[] | null> {
  // Pre-edition-1 swaps have no receipt, including swaps earlier in the upgrade block.
  if (swap.block < RECEIPTS_FROM_BLOCK) return null;
  const raw = await getAleoMappingValue(AMM, "swap_execution_headers", swap.id);
  if (!raw) {
    if (swap.block === RECEIPTS_FROM_BLOCK) return null;
    throw new Error(`shield-swap: missing execution receipt for ${swap.id}`);
  }
  const header = struct(parseAleoPlaintext(raw));
  if (aleoNumber(header.hop_count) !== swap.hops.length || aleoNumber(header.executed_height) !== swap.block)
    throw new Error(`shield-swap: inconsistent execution header for ${swap.id}`);
  const hops: Execution[] = [];
  // Keep the global request budget at three swaps in flight, rather than multiplying it by hops.
  for (const [i, expected] of swap.hops.entries()) {
    const key = `{ swap_id: ${swap.id}, hop_index: ${i}u8 }`;
    const rawHop = await getAleoMappingValue(AMM, "swap_execution_hops", key);
    if (!rawHop) throw new Error(`shield-swap: missing hop ${i} of ${swap.id}`);
    const value = struct(parseAleoPlaintext(rawHop));
    const hop = parseHop(value);
    const amountIn = aleoBigInt(value.amount_in);
    const fees = aleoBigInt(value.fee_paid);
    const revenue = aleoBigInt(value.protocol_fee);
    if (hop.pool !== expected.pool || hop.zeroForOne !== expected.zeroForOne ||
      amountIn < 0n || fees < 0n || revenue < 0n || revenue > fees || fees > amountIn)
      throw new Error(`shield-swap: inconsistent hop ${i} of ${swap.id}`);
    hops.push({ ...hop, amountIn, fees, revenue });
  }
  return hops;
}

function policyCharge(swap: Swap): bigint {
  const authorizations = swap.transitions.filter(t =>
    t.program === PRICING_TERMS && t.function === "authorize_policy" && t.inputs[0]?.value === swap.id);
  if (!authorizations.length) {
    const policyRoute = swap.transitions.some(t => t.program === ROUTER &&
      (t.function.endsWith("_with_policy") || t.function.endsWith("_terms_and_policy")) &&
      t.outputs.some(o => o.type === "public" && o.value === swap.id));
    if (policyRoute) throw new Error(`shield-swap: missing policy authorization for ${swap.id}`);
    return 0n;
  }
  if (authorizations.length !== 1) throw new Error(`shield-swap: duplicate policy authorization for ${swap.id}`);
  const inputs = authorizations[0].inputs;
  if (inputs.length !== 3 || inputs.some(i => i.type !== "public" || !i.value))
    throw new Error(`shield-swap: malformed policy authorization for ${swap.id}`);
  const bps = aleoBigInt(inputs[2].value!);
  if (inputs[1]?.value !== swap.hops[0].pool || bps < 0n || bps >= 10_000n)
    throw new Error(`shield-swap: invalid policy authorization for ${swap.id}`);
  // The permit is deleted in the same transaction. The historical rate survives in public inputs.
  return swap.amountIn * bps / 10_000n;
}

function tokenAmount(tokenId: string, amount: bigint) {
  const token = TOKENS[tokenId];
  if (!token) throw new Error(`shield-swap: no price feed for token ${tokenId}`);
  if (amount < 0n) throw new Error(`shield-swap: invalid amount for ${tokenId}`);
  const digits = amount.toString().padStart(token.decimals + 1, "0");
  // The SDK requires numeric whole-token amounts for CoinGecko balances. Convert only after scaling.
  const value = Number(`${digits.slice(0, -token.decimals)}.${digits.slice(-token.decimals)}`);
  if (!Number.isFinite(value)) throw new Error(`shield-swap: invalid amount for ${tokenId}`);
  return { token: token.coingeckoId, value };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const calls = await getAleoProgramCallsSince(AMM, options.fromTimestamp);
  const swapCalls = calls.filter(c => c.status === "Accepted" && SWAPS.has(c.function_id) &&
    c.block_timestamp >= options.startTimestamp && c.block_timestamp < options.endTimestamp);
  const ids = [...new Set(swapCalls.map(c => c.transaction_id))];
  const transitions = await getAleoTransactionTransitions(ids);
  const swaps = ids.flatMap(id => {
    const ts = transitions[id];
    const block = swapCalls.find(c => c.transaction_id === id)!.block_number;
    const ownSwaps = ts?.filter(t => t.program === AMM && SWAPS.has(t.function));
    if (!ownSwaps?.length) throw new Error(`shield-swap: no swap transition in ${id}`);
    const parsed = ownSwaps.map(t => parseSwap(t, block, ts));
    for (const t of ts.filter(t => t.program === PRICING_TERMS && t.function === "authorize_policy")) {
      if (!parsed.some(s => s.id === t.inputs[0]?.value))
        throw new Error(`shield-swap: policy authorization has no matching swap in ${id}`);
    }
    return parsed;
  });
  if (new Set(swaps.map(s => s.id)).size !== swaps.length)
    throw new Error("shield-swap: duplicate swap ID");
  const executions = new Map<string, Execution[]>();
  const { errors } = await PromisePool.withConcurrency(CONCURRENCY).for(swaps).process(async swap => {
    const hops = await receipt(swap);
    if (hops) executions.set(swap.id, hops);
  });
  if (errors.length) throw errors[0];

  // Only immutable pool identity and creation fee are shared within this fetch. No live fee is cached.
  const pools = new Map<string, Pool>();
  const keys = [...new Set(swaps.flatMap(s => s.hops.map(h => h.pool)))];
  const poolReads = await PromisePool.withConcurrency(CONCURRENCY).for(keys).process(async key => {
    const raw = await getAleoMappingValue(AMM, "pools", key);
    if (!raw) throw new Error(`shield-swap: missing pool ${key}`);
    const pool = struct(parseAleoPlaintext(raw));
    pools.set(key, { token0: literal(pool.token0), token1: literal(pool.token1), fee: aleoBigInt(pool.fee) });
  });
  if (poolReads.errors.length) throw poolReads.errors[0];
  const inputToken = (hop: Hop) => {
    const pool = pools.get(hop.pool)!;
    return hop.zeroForOne ? pool.token0 : pool.token1;
  };

  const legacy = swaps.filter(s => !executions.has(s.id));
  if (legacy.length) {
    // Preserve pre-receipt coverage as an explicit estimate. Current pool metadata cannot price history.
    const history = await getAleoProgramCallsSince(AMM, Date.parse(START) / 1000);
    const accepted = history.filter(c => c.status === "Accepted");
    const setters = accepted.filter(c => c.function_id === "set_fee_protocol" && c.block_number <= RECEIPTS_FROM_BLOCK);
    const claims = accepted.filter(c => CLAIMS.has(c.function_id) && c.block_timestamp >= options.fromTimestamp &&
      c.block_timestamp < options.toTimestamp + CLAIM_LAG_SECONDS);
    const txs = await getAleoTransactionTransitions([...new Set([...setters, ...claims].map(c => c.transaction_id))]);
    const remainders = new Map<string, bigint>();
    for (const call of claims) {
      for (const t of txs[call.transaction_id].filter(t => t.program === AMM && CLAIMS.has(t.function))) {
        const args = futureArguments(t);
        remainders.set(literal(args[0]), t.function === "claim_swap_output" ? aleoBigInt(args[4]) : 0n);
      }
    }
    const changes = setters.flatMap(c => txs[c.transaction_id]
      .filter(t => t.program === AMM && t.function === "set_fee_protocol")
      .map(t => ({ block: c.block_number, args: futureArguments(t) }))).sort((a, b) => a.block - b.block);
    for (const swap of legacy) {
      const filled = swap.amountIn - (remainders.get(swap.id) ?? 0n);
      if (filled < 0n) throw new Error(`shield-swap: invalid legacy refund for ${swap.id}`);
      for (const hop of swap.hops) {
        // Every legacy pool was paired with USDCx. Intermediate legacy hop amounts were not recorded.
        const { token, value } = tokenAmount(inputToken(swap.hops[0]), filled);
        const fee = value * Number(pools.get(hop.pool)!.fee) / 1e6;
        let split = 5n; // Edition 0 initializes every pool with fee_protocol=5.
        for (const change of changes) {
          if (literal(change.args[1]) !== hop.pool || change.block > swap.block) continue;
          if (change.block === swap.block) throw new Error("shield-swap: legacy fee change needs transaction ordering");
          split = aleoBigInt(change.args[2]);
        }
        const revenue = fee * Number(split) / 16;
        dailyVolume.addCGToken(token, value);
        dailyFees.addCGToken(token, fee, METRIC.SWAP_FEES);
        dailyRevenue.addCGToken(token, revenue, METRIC.PROTOCOL_FEES);
        dailySupplySideRevenue.addCGToken(token, fee - revenue, METRIC.LP_FEES);
      }
    }
  }

  for (const swap of swaps) {
    const hops = executions.get(swap.id);
    if (!hops) continue;
    for (const hop of hops) {
      const tokenId = inputToken(hop);
      const volume = tokenAmount(tokenId, hop.amountIn);
      const fees = tokenAmount(tokenId, hop.fees);
      const revenue = tokenAmount(tokenId, hop.revenue);
      const lpFees = tokenAmount(tokenId, hop.fees - hop.revenue);
      dailyVolume.addCGToken(volume.token, volume.value);
      dailyFees.addCGToken(fees.token, fees.value, METRIC.SWAP_FEES);
      dailyRevenue.addCGToken(revenue.token, revenue.value, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.addCGToken(lpFees.token, lpFees.value, METRIC.LP_FEES);
    }
    const charge = tokenAmount(inputToken(swap.hops[0]), policyCharge(swap));
    dailyFees.addCGToken(charge.token, charge.value, METRIC.TRADING_FEES);
    dailyRevenue.addCGToken(charge.token, charge.value, METRIC.TRADING_FEES);
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const poolFeeMethodology = "Actual fee_paid from each on-chain swap_execution_hops receipt, in that hop's input token. Receipts automatically reflect fee changes, discounts and partial fills.";
const policyMethodology = "Additional protocol charge authorized by shield_swap_pricing_terms.aleo/authorize_policy in an accepted swap transaction: floor(gross input * historical policy_bps / 10000), counted once per swap. It is excluded from AMM receipts and has no LP share.";
const protocolMethodology = "Actual protocol_fee from each executed hop, plus the additional protocol charge on policy routes.";
const legacyMethodology = "Before permanent receipts (edition 1, August 12 2026), fees are estimated from creation fee tiers, claims and historical protocol-split updates; multi-hop notionals and unclaimed fills are approximate.";

const adapter: SimpleAdapter = {
  version: 2, pullHourly: true, fetch, chains: [CHAIN.ALEO], start: START,
  methodology: {
    Volume: "Actual amount_in per executed hop from permanent on-chain receipts; excludes the additional protocol charge. " + legacyMethodology,
    Fees: poolFeeMethodology + " " + policyMethodology + " " + legacyMethodology,
    UserFees: "All pool swap fees and additional protocol charges paid by traders.",
    Revenue: protocolMethodology + " " + legacyMethodology,
    ProtocolRevenue: "Pool protocol fees and additional protocol charges retained by the protocol; no fees are distributed to token holders.",
    SupplySideRevenue: "fee_paid minus protocol_fee per executed hop. Additional protocol charges have no LP share. " + legacyMethodology,
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: poolFeeMethodology, [METRIC.TRADING_FEES]: policyMethodology },
    UserFees: { [METRIC.SWAP_FEES]: poolFeeMethodology, [METRIC.TRADING_FEES]: policyMethodology },
    Revenue: { [METRIC.PROTOCOL_FEES]: "Actual protocol_fee per executed hop.", [METRIC.TRADING_FEES]: policyMethodology },
    ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: "Actual protocol_fee per executed hop.", [METRIC.TRADING_FEES]: policyMethodology },
    SupplySideRevenue: { [METRIC.LP_FEES]: "Actual fee_paid minus protocol_fee per executed hop." },
  },
};
export default adapter;
