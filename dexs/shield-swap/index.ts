import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import {
  AleoTransition,
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

// Shield Swap is a confidential concentrated-liquidity AMM on Aleo. Swap sizes, routes and pool
// state are public on the ledger, so every number below is read from Aleo chain state.
// https://shield.fi/docs/confidentiality/public-data
const AMM = "shield_swap.aleo";

const SWAP = "swap";
const SWAP_MULTI_HOP = "swap_multi_hop";
const CLAIM = "claim_swap_output";
const CLAIM_NO_REFUND = "claim_swap_output_no_refund";

// The protocol keeps `fee_protocol / PROTOCOL_FEE_DENOMINATOR` of every swap fee; the rest accrues
// to the LP position. `fee_protocol` itself is read per pool from the on-chain `slots` mapping.
// https://shield.fi/docs/reference/constants-and-limits ("The protocol share is fee_protocol / 16")
const PROTOCOL_FEE_DENOMINATOR = 16n;

// Pool `fee` is a u16 count of parts per million (200 => 0.02%), same source as above.
const FEE_PPM_DENOMINATOR = 1_000_000n;

// A swap settles in a separate claim transaction, observed 23-151s after the swap over a 493-claim
// sample. Half an hour of slack keeps the number of transactions read per run near the number of
// swaps in the window.
const CLAIM_LAG_SECONDS = 30 * 60;

// AMM-side ARC-20 token ids, read off the on-chain `pools` mapping. Aleo carries no decimal
// registry - "The AMM uses native token base units directly. It has no on-chain decimal scale or
// normalization registry." (https://shield.fi/docs/reference/constants-and-limits) - so decimals and
// the price feed are pinned here, matching the Shield Swap TVL adapter. USDCx is a USD stablecoin on
// Aleo with no DefiLlama price feed of its own, so it is priced at parity via usd-coin; a de-peg
// would overstate volume and fees. A swap whose input token is missing from this list is logged and
// skipped so one newly approved asset cannot take out the whole window; the log says to add it here.
const TOKENS: Record<string, { symbol: string; decimals: number; coingeckoId: string }> = {
  "724721105858008932013114020280511843613117371369744086165619field": { symbol: "ALEO", decimals: 6, coingeckoId: "aleo" },
  "1926848598207449231969field": { symbol: "ETH", decimals: 18, coingeckoId: "ethereum" },
  "2000279227181771747937field": { symbol: "SOL", decimals: 9, coingeckoId: "solana" },
  "469661199361043738096225field": { symbol: "wBTC", decimals: 8, coingeckoId: "bitcoin" },
  "212707628815602939926313406778312270053663804591730917421274098438979020915field": { symbol: "USDCx", decimals: 6, coingeckoId: "usd-coin" },
};

interface Pool {
  token0: string;
  token1: string;
  feePpm: bigint;
  feeProtocol: bigint;
}

interface Hop {
  pool: string;
  zeroForOne: boolean;
}

interface Swap {
  swapId: string;
  amountIn: bigint;
  hops: Hop[];
}

interface Claim {
  remainder: bigint;
}

/** The AMM's own transition inside a transaction, named so a missing one is diagnosable. */
function transitionOf(transitions: AleoTransition[], functionName: string, transactionId: string): AleoTransition {
  const transition = transitions?.find((t) => t.program === AMM && t.function === functionName);
  // The call list said this transaction calls the AMM, so a missing transition means the RPC
  // returned a transaction we cannot read - surface which one rather than a bare TypeError.
  if (!transition) throw new Error(`shield-swap: ${transactionId} has no ${AMM}/${functionName} transition`);
  return transition;
}

/** A single-hop swap: the request struct carries the pool, direction and input size. */
function parseSwap(transitions: AleoTransition[], transactionId: string): Swap {
  const transition = transitionOf(transitions, SWAP, transactionId);
  // swap(request, token0, token1, swap_id, ...) - the request struct carries pool, direction and size
  const request = futureArguments(transition)[0];
  if (typeof request !== "object" || Array.isArray(request)) throw new Error("shield-swap: malformed swap request");
  return {
    swapId: firstPublicOutput(transition),
    amountIn: aleoBigInt(request.amount_in),
    hops: [{ pool: request.pool as string, zeroForOne: aleoBool(request.zero_for_one) }],
  };
}

/** A routed swap: hop0..hopN-1 are the legs actually taken, hop_count says how many. */
function parseMultiHopSwap(transitions: AleoTransition[], transactionId: string): Swap {
  const transition = transitionOf(transitions, SWAP_MULTI_HOP, transactionId);
  const request = futureArguments(transition)[0];
  if (typeof request !== "object" || Array.isArray(request)) throw new Error("shield-swap: malformed multi-hop request");
  // Routes are 2 or 3 hops; unused hop slots repeat the previous hop, so only hop_count entries count.
  // https://shield.fi/docs/reference/constants-and-limits
  const hopCount = aleoNumber(request.hop_count);
  const hops: Hop[] = [];
  for (let i = 0; i < hopCount; i++) {
    const hop = request[`hop${i}`];
    if (typeof hop !== "object" || Array.isArray(hop)) throw new Error(`shield-swap: malformed hop${i}`);
    hops.push({ pool: hop.pool as string, zeroForOne: aleoBool(hop.zero_for_one) });
  }
  return {
    swapId: firstPublicOutput(transition),
    amountIn: aleoBigInt(request.amount_in),
    hops,
  };
}

/** The settlement of a swap: the part of the input that was not filled, and so refunded. */
function parseClaim(transitions: AleoTransition[], functionName: string, transactionId: string): [string, Claim] {
  const transition = transitionOf(transitions, functionName, transactionId);
  // claim_swap_output(swap_id, token_in, token_out, amount_out, amount_remaining, ...)
  // amount_remaining is denominated in token_in.
  // claim_swap_output_no_refund has no remainder argument.
  const args = futureArguments(transition);
  const swapId = args[0] as string;
  return [swapId, { remainder: functionName === CLAIM ? aleoBigInt(args[4]) : 0n }];
}

// Fee tier and protocol split change only by admin action, so they are resolved once per process
// rather than re-read for every window a run covers. Mappings hold current consensus state rather
// than history (https://shield.fi/docs/reference/mappings), so a backfilled window is priced with
// today's fee tier; both have been unchanged (200/800/100/200 ppm, fee_protocol 5) since launch.
// Keyed on the in-flight promise, not the resolved value, so windows running concurrently share one
// read instead of each issuing its own. A rejected read is evicted so a later window can retry.
const poolCache: Record<string, Promise<Pool>> = {};
// Matches the concurrency the Aleo helper uses for its own reads, so a run stays inside the same
// request budget whether it is reading pools or transactions.
const POOL_CONCURRENCY = 3;

/** Pool state for a key, shared between concurrent callers and retried after a failure. */
function loadPool(poolKey: string): Promise<Pool> {
  if (!poolCache[poolKey])
    poolCache[poolKey] = getPool(poolKey).catch((e) => {
      delete poolCache[poolKey];
      throw e;
    });
  return poolCache[poolKey];
}

/** Fee tier and protocol split of one pool, read from the AMM's pools and slots mappings. */
async function getPool(poolKey: string): Promise<Pool> {
  const [poolState, slot] = await Promise.all([
    getAleoMappingValue(AMM, "pools", poolKey),
    getAleoMappingValue(AMM, "slots", poolKey),
  ]);
  if (!poolState || !slot) throw new Error(`shield-swap: pool ${poolKey} is missing on-chain state`);
  const pool = parseAleoPlaintext(poolState);
  const slotState = parseAleoPlaintext(slot);
  if (typeof pool !== "object" || Array.isArray(pool) || typeof slotState !== "object" || Array.isArray(slotState))
    throw new Error(`shield-swap: malformed state for pool ${poolKey}`);
  return {
    token0: pool.token0 as string,
    token1: pool.token1 as string,
    feePpm: aleoBigInt(pool.fee),
    feeProtocol: aleoBigInt(slotState.fee_protocol),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const calls = await getAleoProgramCallsSince(AMM, options.fromTimestamp);
  const accepted = calls.filter((call) => call.status === "Accepted");
  if (!accepted.length) throw new Error("shield-swap: no accepted AMM calls returned by the Aleo RPC");

  const swapCalls = accepted.filter(
    (call) =>
      (call.function_id === SWAP || call.function_id === SWAP_MULTI_HOP) &&
      call.block_timestamp >= options.fromTimestamp &&
      call.block_timestamp < options.toTimestamp
  );
  // Claims settle a swap and publish the exact filled output and the unspent input. A claim always
  // follows its swap, and never by much, so the window is extended forward rather than read whole.
  const claimCalls = accepted.filter(
    (call) =>
      (call.function_id === CLAIM || call.function_id === CLAIM_NO_REFUND) &&
      call.block_timestamp >= options.fromTimestamp &&
      call.block_timestamp < options.toTimestamp + CLAIM_LAG_SECONDS
  );

  const transitions = await getAleoTransactionTransitions([
    ...new Set([...swapCalls, ...claimCalls].map((call) => call.transaction_id)),
  ]);

  const claims: Record<string, Claim> = {};
  for (const call of claimCalls) {
    const [swapId, claim] = parseClaim(transitions[call.transaction_id], call.function_id, call.transaction_id);
    claims[swapId] = claim;
  }

  const swaps = swapCalls.map((call) =>
    call.function_id === SWAP
      ? parseSwap(transitions[call.transaction_id], call.transaction_id)
      : parseMultiHopSwap(transitions[call.transaction_id], call.transaction_id)
  );

  const needed = [...new Set(swaps.flatMap((swap) => swap.hops.map((hop) => hop.pool)))];
  const { errors } = await PromisePool.withConcurrency(POOL_CONCURRENCY)
    .for(needed.filter((poolKey) => !poolCache[poolKey]))
    .process(async (poolKey) => {
      await loadPool(poolKey);
    });
  if (errors.length) throw errors[0];
  const pools: Record<string, Pool> = Object.fromEntries(
    await Promise.all(needed.map(async (key) => [key, await loadPool(key)] as const))
  );

  for (const swap of swaps) {
    const claim = claims[swap.swapId];
    // The tick-walk loop is capped, so a swap can fill partially and refund the rest on claim.
    // An unsettled swap has no published refund yet; partial fills are rare enough that treating it
    // as fully filled is the closest available estimate.
    const filledIn = swap.amountIn - (claim?.remainder ?? 0n);
    if (filledIn <= 0n) continue;

    const entryPool = pools[swap.hops[0].pool];
    const entryTokenId = swap.hops[0].zeroForOne ? entryPool.token0 : entryPool.token1;

    const token = TOKENS[entryTokenId];
    // The admin can approve an asset before this list knows how to price it. That is recoverable:
    // log it and keep the swaps we can price rather than losing the whole window.
    if (!token) {
      // console, not sdk.log: sdk.log only prints under LLAMA_DEBUG_MODE, which would make the gap
      // invisible on a normal run - the whole point is that the omission is visible.
      console.error(`shield-swap: no price feed for token ${entryTokenId} (swap ${swap.swapId}), swap skipped`);
      continue;
    }
    const notional = Number(filledIn) / 10 ** token.decimals;
    if (!Number.isFinite(notional)) throw new Error(`shield-swap: bad ${token.symbol} amount ${filledIn}`);

    // Every pool is quoted against a stablecoin, so a route carries the same notional through each of
    // its hops, less the fee taken on the way. The entry leg's exact input therefore sizes the whole
    // route, and every hop is counted at that notional.
    for (const hop of swap.hops) {
      const pool = pools[hop.pool];

      const fees = (Number(pool.feePpm) / Number(FEE_PPM_DENOMINATOR)) * notional;
      const revenue = (Number(pool.feeProtocol) / Number(PROTOCOL_FEE_DENOMINATOR)) * fees;

      dailyVolume.addCGToken(token.coingeckoId, notional);
      dailyFees.addCGToken(token.coingeckoId, fees, METRIC.SWAP_FEES);
      dailyRevenue.addCGToken(token.coingeckoId, revenue, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.addCGToken(token.coingeckoId, fees - revenue, METRIC.LP_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
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
  start: '2026-07-30',
  methodology: {
    Volume: "Input notional of every accepted swap and swap_multi_hop call to shield_swap.aleo, read from the public swap request on the Aleo ledger and counted once per hop of the route.",
    Fees: "Swap volume multiplied by each pool's on-chain fee tier (the pools mapping stores it as parts per million).",
    UserFees: "Identical to Fees - traders pay the whole swap fee.",
    Revenue: "The protocol's cut of the swap fee, fee_protocol/16 per the pool's on-chain slots entry.",
    ProtocolRevenue: "Same as Revenue; Shield Swap has no token, so none of it is passed to holders.",
    SupplySideRevenue: "The remaining (16 - fee_protocol)/16 of the swap fee, which accrues to the concentrated-liquidity position that provided it.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap volume times the pool fee tier read from the on-chain pools mapping.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "fee_protocol/16 of the swap fee, retained by the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "fee_protocol/16 of the swap fee, retained by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "(16 - fee_protocol)/16 of the swap fee, credited to liquidity positions.",
    },
  },
};

export default adapter;
