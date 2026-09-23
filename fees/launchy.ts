import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { METRIC } from "../helpers/metrics";
import { httpPost } from "../utils/fetchURL";

type StarknetEvent = {
  from_address: string;
  transaction_hash: string;
  keys: string[];
  data: string[];
};

const CORE = "0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b";
const STRK = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ZEC = "0x5ce53b9b68fb8e9ecab9283a96d97948914733fd6ed8d9a53a276a419497841";
const OLD_TOKEN = "0x102afba5503106923749b983bbdf265cb1108fcddc104a781fe33336186a702";
const OLD_ROUTER = "0x516c732e7f532e6fcc62b84b47e993a109985d733f48dc2b10e2f727ee38358";
const FACTORIES = new Set([
  "0x63883bfd87f65a2e42193f0f5cf18eb69d983abb99b07f7ec9a561b11c85ef4",
  "0x2dab18d11e9484606c460b5fe55f4c21da11b855adedcfb6bf838e8a814c136",
  "0x38948e1e6887b2f6614561a41f6e82787a9c2747bfae89991a105f64b5c3604",
  "0xb6754da1f60bf4305b0a49bd2db208072a9fccebbee03604706889da2f85ab",
]);
const TREASURIES = [
  "0x1089551c3af461fd01a80417b7adf9edd3ce6e05d8a1660ae4c4bc50b907345",
  "0x4bf61829119f64bbcf26107b1143c37c76aa94b8f1dc21eb9fce07aebefe3ee",
];
const GUARDED_POOLS = new Set([
  "0x7e152ee0f4531518a9ac8ded4f6ff4241a19eb1680ccd1b6c63b29bea9142e4",
  "0x6d7662a861e570189e5d6967827c4c802842609996b7f2cdf236cb572c930a3",
  "0x75f1ef5753c07b2846e35bee109ea70ff651ed7348a9c200b3e354c1e98741d",
]);

// Starknet selectors for Swapped, MemecoinCreated, Transfer and SwapExecuted.
const SELECTORS = {
  swapped: "0x157717768aca88da4ac4279765f09f4d0151823d573537fbbeb950cdbd9a870",
  created: "0x1be539d3a1327d450ab9b7a754f7708ea94f67182f2506217cafff2d694f8e1",
  transfer: "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9",
  routerSwap: "0x9d63164e1c7ea99a5df7cbd52fc2e71e34339a33d733772ae169129074ca5e",
};
const Q128 = 1n << 128n;
const V1_FEE = 1020847100762815390390123822295304634n; // 0.3%
const V3_FEE = Q128 / 100n; // 1%
const normalize = (value: string) => `0x${BigInt(value).toString(16)}`;
const same = (a: string, b: string) => BigInt(a) === BigInt(b);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

async function rpcCall(method: string, params: unknown[]) {
  const payload = { jsonrpc: "2.0", id: 1, method, params };
  const endpoints = [getEnv("STARKNET_RPC"), "https://starknet-rpc.publicnode.com"];
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const response = await httpPost(endpoint, payload);
      if (response.error) throw new Error(JSON.stringify(response.error));
      return response.result;
    } catch (error) { lastError = error; }
  }
  throw new Error(`Starknet ${method} failed: ${lastError}`);
}

const blockTimestamps = new Map<number, number>();
async function blockTimestamp(height: number) {
  if (!blockTimestamps.has(height)) {
    const block = await rpcCall("starknet_getBlockWithTxHashes", [{ block_number: height }]);
    blockTimestamps.set(height, block.timestamp);
  }
  return blockTimestamps.get(height)!;
}

// Starknet has no timestamp-to-block RPC, and DefiLlama's generic block helper
// does not support this chain. Find the first block at or after a UTC boundary.
async function blockAtOrAfter(timestamp: number, low = 0) {
  let high = Number(await rpcCall("starknet_blockNumber", [])) + 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (await blockTimestamp(mid) < timestamp) low = mid + 1;
    else high = mid;
  }
  return low;
}

async function getEvents(fromBlock: number, toBlock: number, keys: string[][], address?: string) {
  const events: StarknetEvent[] = [];
  for (let from = fromBlock; from <= toBlock; from += 5000) {
    let continuation_token: string | undefined;
    do {
      const filter = {
        from_block: { block_number: from },
        to_block: { block_number: Math.min(from + 4999, toBlock) },
        ...(address ? { address } : {}),
        keys,
        chunk_size: 1000,
        ...(continuation_token ? { continuation_token } : {}),
      };
      const result = await rpcCall("starknet_getEvents", [filter]);
      events.push(...result.events);
      continuation_token = result.continuation_token;
    } while (continuation_token);
  }
  return events;
}

function quoteAsset(token0: string, token1: string) {
  if (same(token0, STRK) || same(token1, STRK)) return STRK;
  if (same(token0, ZEC) || same(token1, ZEC)) return ZEC;
  throw new Error("Launchy pool has no supported quote asset");
}

function quoteEquivalent(tokenIn: string, tokenOut: string, inputFee: bigint,
  inputAmount: bigint, outputAmount: bigint, quote: string) {
  if (same(tokenIn, quote)) return inputFee;
  if (!same(tokenOut, quote) || inputAmount <= inputFee)
    throw new Error("Cannot value Launchy fee in its quote asset");
  // Value an unpriced launch-token fee at that swap's executed exchange rate.
  return inputFee * outputAmount / (inputAmount - inputFee);
}

const fetch = async (options: FetchOptions) => {
  const fromBlock = await blockAtOrAfter(options.fromTimestamp);
  const toBlock = await blockAtOrAfter(options.toTimestamp, fromBlock) - 1;
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [swaps, creations, routerSwaps] = await Promise.all([
    getEvents(fromBlock, toBlock, [[SELECTORS.swapped]], CORE),
    getEvents(fromBlock, toBlock, [[SELECTORS.created]]),
    getEvents(fromBlock, toBlock, [[SELECTORS.routerSwap]], OLD_ROUTER),
  ]);

  for (const event of swaps) {
    const d = event.data;
    if (d.length < 18) continue;
    const token0 = normalize(d[1]);
    const token1 = normalize(d[2]);
    const extension = normalize(d[5]);
    const guarded = GUARDED_POOLS.has(extension) && BigInt(d[3]) === V3_FEE && BigInt(d[4]) === 20000n;
    const original = BigInt(extension) === 0n && BigInt(d[3]) === V1_FEE
      && BigInt(d[4]) === 5982n && (same(token0, OLD_TOKEN) || same(token1, OLD_TOKEN));
    if (!guarded && !original) continue;

    const quote = quoteAsset(token0, token1);
    const amount0 = BigInt(d[12]);
    const amount1 = BigInt(d[14]);
    const sign0 = BigInt(d[13]);
    const sign1 = BigInt(d[15]);
    if (!amount0 || !amount1 || sign0 === sign1) continue;
    const tokenIn = sign0 === 0n ? token0 : token1;
    const tokenOut = sign0 === 0n ? token1 : token0;
    const amountIn = sign0 === 0n ? amount0 : amount1;
    const amountOut = sign0 === 0n ? amount1 : amount0;
    // Ekubo does not emit per-step fees. This reproduces its Q128 fee rounding
    // from the on-chain input delta; tick-crossing dust may differ by a few units.
    const feeIn = ceilDiv(amountIn * BigInt(d[3]), Q128);
    const fee = quoteEquivalent(tokenIn, tokenOut, feeIn, amountIn, amountOut, quote);
    const protocol = guarded ? fee * 30n / 100n : 0n;
    const ekubo = fee * 20n / 100n;
    const creator = fee - protocol - ekubo;
    dailyFees.add(quote, fee.toString(), METRIC.SWAP_FEES);
    dailyUserFees.add(quote, fee.toString(), METRIC.SWAP_FEES);
    dailyRevenue.add(quote, protocol.toString(), "Launchy LP Fee Share");
    dailySupplySideRevenue.add(quote, creator.toString(), METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(quote, ekubo.toString(), "Ekubo Fee Share");
  }

  for (const event of routerSwaps) {
    const d = event.data;
    if (d.length < 9) continue;
    const tokenIn = normalize(d[2]);
    const tokenOut = normalize(d[3]);
    const quote = quoteAsset(tokenIn, tokenOut);
    const platformFee = BigInt(d[5]);
    const creatorFee = BigInt(d[6]);
    const consumed = BigInt(d[7]);
    const output = BigInt(d[8]);
    const platform = quoteEquivalent(tokenIn, tokenOut, platformFee, consumed + platformFee, output, quote);
    const creator = quoteEquivalent(tokenIn, tokenOut, creatorFee, consumed + creatorFee, output, quote);
    const gross = platform + creator;
    dailyFees.add(quote, gross.toString(), "Launchy Router Fees");
    dailyUserFees.add(quote, gross.toString(), "Launchy Router Fees");
    dailyRevenue.add(quote, platform.toString(), "Launchy Router Share");
    dailySupplySideRevenue.add(quote, creator.toString(), "Router Creator Share");
  }

  const created = creations.filter((event) => FACTORIES.has(normalize(event.from_address)));
  if (created.length) {
    const transfers = await getEvents(fromBlock, toBlock,
      [[SELECTORS.transfer], [], TREASURIES], STRK);
    const createdTransactions = new Set(created.map((event) => event.transaction_hash));
    const creationPayments = transfers.filter((event) =>
      createdTransactions.has(event.transaction_hash) && event.keys.length >= 3);
    if (creationPayments.length !== created.length)
      throw new Error("Launchy creation-fee transfer count does not match token creations");
    for (const event of creationPayments) {
      const amount = BigInt(event.data[0]) + (BigInt(event.data[1]) << 128n);
      dailyFees.add(STRK, amount.toString(), "Token Creation Fees");
      dailyUserFees.add(STRK, amount.toString(), "Token Creation Fees");
      dailyRevenue.add(STRK, amount.toString(), "Token Creation Fees");
    }
  }

  return { dailyFees, dailyUserFees, dailyRevenue,
    dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Token creation fees paid in STRK plus swap fees generated in Launchy-created Ekubo pools and the original Launchy router.",
  UserFees: "The same token creation and swap fees, paid by token creators and traders.",
  Revenue: "Creation fees plus Launchy's 30% share of guarded-pool fees and its original router fee share.",
  ProtocolRevenue: "All Launchy revenue is directed to the platform treasury.",
  SupplySideRevenue: "Swap fees attributable to token creators and Ekubo, plus creator fees from the original router.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Ekubo pool swap fees estimated from on-chain swap input deltas and each pool's fee rate.",
    "Launchy Router Fees": "Extra trading fees emitted by the original Launchy router.",
    "Token Creation Fees": "STRK transfers to Launchy treasuries in token-creation transactions.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Trading fees paid to Launchy-created Ekubo pools.",
    "Launchy Router Fees": "Extra fees paid to the original Launchy router.",
    "Token Creation Fees": "Fees paid when a Launchy token is created.",
  },
  Revenue: {
    "Launchy LP Fee Share": "30% of guarded-pool swap fees allocated to Launchy.",
    "Launchy Router Share": "Platform portion emitted by the original Launchy router.",
    "Token Creation Fees": "Creation fees transferred to Launchy treasuries.",
  },
  ProtocolRevenue: {
    "Launchy LP Fee Share": "30% of guarded-pool swap fees allocated to Launchy.",
    "Launchy Router Share": "Platform portion emitted by the original Launchy router.",
    "Token Creation Fees": "Creation fees transferred to Launchy treasuries.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "Creator portion of pool swap fees.",
    "Ekubo Fee Share": "Ekubo's 20% share of fees collected by Positions.",
    "Router Creator Share": "Creator portion emitted by the original Launchy router.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.STARKNET],
  start: "2026-09-18",
  fetch,
  methodology,
  breakdownMethodology,
  doublecounted: true, // Ekubo also reports the underlying pool swap fees.
};

export default adapter;
