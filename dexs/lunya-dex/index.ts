import { getEventLogs } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";

// Lunya pool factory, deployed at the same address on every chain
const FACTORY = "0x711492DF23F320745de6fD7f0ab9564FDBfeA016";
// The block the factory was deployed at
const FROM_BLOCK = 21067506;
// Arc produces a block every half second, so a day spans ~60k blocks while its public endpoints cap a
// log query well below that - the one this was tested against refuses 10k. Split the window rather
// than ask for it whole, with room to spare since the cap is the node operator's to change.
const MAX_BLOCK_RANGE = 5_000;

// Lunya's own PoolCreated: the pool type (0 concentrated, 1 constant-product, 2 stable) is indexed
// where Uniswap V3 indexes the fee. A Uniswap-shaped copy exists, but only behind an owner flag.
const eventPoolCreated =
  "event PoolCreated(address indexed token0, address indexed token1, uint8 indexed poolType, int24 tickSpacing, uint24 fee, address pool)";
// Byte-identical to Uniswap V3's Swap, on all three pool types
const eventSwap =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
// Lunya's slot0 returns five words, not Uniswap's seven: no observation state, and the protocol's
// share is stored per token instead of packed into one byte
const abiSlot0 =
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint24 fee, uint16 feeProtocol0, uint16 feeProtocol1)";
// The coin a pool takes its fee in: 0 the coin the trade pays (Uniswap's behaviour), 1 always token0, 2 always token1
const abiFeeToken = "function feeToken() view returns (uint8)";

// SwapFee.DENOMINATOR: fee rates are in hundredths of a basis point
const FEE_DENOMINATOR = 1e6;
// ProtocolShare.DENOMINATOR: the protocol's cut is in basis points of the fee, not of the trade
const PROTOCOL_SHARE_DENOMINATOR = 1e4;
const FEE_TOKEN_PAID = 0;
const FEE_TOKEN_TOKEN0 = 1;

// Wash-trade floor for cheap pools, per dexs/AGENTS.md: "Apply minimum TVL percentage rules for pools
// with very low fee percentages (like 0.01%)". Lunya's lowest configured tier is the stable pool's
// 0.05%, so a pool below that rate has been moved there by setFee and is held to a much higher floor.
const LOW_FEE_RATE = 0.0005;
const LOW_FEE_MIN_USD = 10_000;

async function fetch(options: FetchOptions) {
  const { api, toApi, chain, createBalances } = options;
  // Queried straight through the sdk, as uniswap-v4 and zora-sofi do, so the window can be split:
  // Arc is not on the indexer and its public endpoints cap a log query well below a day of blocks.
  const fromBlock = Number(options.fromApi.block);
  const toBlock = Number(options.toApi.block);
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolLogs = await getEventLogs({ chain, target: FACTORY, eventAbi: eventPoolCreated, fromBlock: FROM_BLOCK, toBlock, onlyArgs: true, cacheInCloud: true, maxBlockRange: MAX_BLOCK_RANGE });
  const pairs: Record<string, string[]> = {};
  for (const log of poolLogs) pairs[String(log.pool).toLowerCase()] = [log.token0, log.token1];

  // THE RATE IS READ AT THE END OF THE WINDOW. A dynamic-fee plugin has the pool write the rate into
  // slot0 inside each swap and emit nothing, so no event carries the rate a given swap paid. Hourly
  // windows keep that approximation tight; pools without a dynamic fee only change rate through setFee,
  // and are read exactly. On Arc the plugin ships with the dynamic fee off — pluginConfig 94, which does
  // not carry DYNAMIC_FEE (1 << 10) — so every pool there is read exactly today.
  const discovered = Object.keys(pairs);
  const slot0ByPool: Record<string, any> = {};
  if (discovered.length) {
    const slot0s = await toApi.multiCall({ abi: abiSlot0, calls: discovered });
    discovered.forEach((pool, i) => { slot0ByPool[pool] = slot0s[i]; });
  }

  // A cheaper pool is cheaper to wash, so the fee rate decides which liquidity floor a pool must clear.
  const lowFeePairs: Record<string, string[]> = {};
  const normalPairs: Record<string, string[]> = {};
  for (const pool of discovered) {
    const rate = Number(slot0ByPool[pool].fee) / FEE_DENOMINATOR;
    (rate < LOW_FEE_RATE ? lowFeePairs : normalPairs)[pool] = pairs[pool];
  }

  // NO POOL CAP. filterPools keeps only the 42 most liquid pools by default, which suits a fork with a
  // handful of pairs. Every graduated launch opens its own pool, so the volume lives in a long tail of
  // young pools; the $200 liquidity floor still screens out empty and wash-traded ones. Same choice as
  // noxa-fun, bowdotfun and ponsdotfamily.
  const [filteredNormal, filteredLowFee] = await Promise.all([
    Object.keys(normalPairs).length ? filterPools({ api, pairs: normalPairs, createBalances, maxPairSize: 1_000_000 }) : {},
    Object.keys(lowFeePairs).length ? filterPools({ api, pairs: lowFeePairs, createBalances, maxPairSize: 1_000_000, minUSDValue: LOW_FEE_MIN_USD }) : {},
  ]);
  const pools = [...Object.keys(filteredNormal), ...Object.keys(filteredLowFee)];

  if (pools.length) {
    const feeTokens = await toApi.multiCall({ abi: abiFeeToken, calls: pools });
    // GROUPED HERE, NOT BY THE SDK. With maxBlockRange the sdk splits by block range before it splits by
    // target, so flatten: false nests range -> pool -> log rather than pool -> log, and an hourly window
    // (~7,200 blocks) always splits. Take the flat list with each log's address and group it instead.
    const swapLogs = await getEventLogs({ chain, targets: pools, eventAbi: eventSwap, fromBlock, toBlock, entireLog: true, parseLog: true, onlyArgs: false, maxBlockRange: MAX_BLOCK_RANGE });
    const logsByPool: Record<string, any[]> = {};
    for (const log of swapLogs) (logsByPool[String(log.address ?? log.source).toLowerCase()] ??= []).push(log.args);

    pools.forEach((pool, i) => {
      const logs = logsByPool[pool] ?? [];
      if (!logs.length) return;
      const [token0, token1] = pairs[pool];
      const slot0 = slot0ByPool[pool];
      const feeRate = Number(slot0.fee) / FEE_DENOMINATOR;
      const feeToken = Number(feeTokens[i]);

      for (const log of logs) {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });

        // mirrors LunyaPoolBase._feeOnOutput: which coin this swap's fee was taken from
        const zeroForOne = BigInt(log.amount0) > 0n;
        const feeOnOutput = feeToken === FEE_TOKEN_PAID ? false : feeToken === FEE_TOKEN_TOKEN0 ? !zeroForOne : zeroForOne;
        const feeOnToken0 = zeroForOne !== feeOnOutput;
        const amount = Math.abs(Number(feeOnToken0 ? log.amount0 : log.amount1));
        // an input amount includes its fee; an output amount is what was left after it
        const fee = feeOnOutput ? (amount * feeRate) / (1 - feeRate) : amount * feeRate;
        const protocolShare = Number(feeOnToken0 ? slot0.feeProtocol0 : slot0.feeProtocol1) / PROTOCOL_SHARE_DENOMINATOR;
        const token = feeOnToken0 ? token0 : token1;

        dailyFees.add(token, fee, METRIC.SWAP_FEES);
        dailyRevenue.add(token, fee * protocolShare, METRIC.SWAP_FEES);
        dailySupplySideRevenue.add(token, fee * (1 - protocolShare), METRIC.SWAP_FEES);
      }
    });
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "Every swap on a Lunya pool, from Swap events.",
  Fees: "Swap fees paid by traders: each swap's amount times its pool's fee rate. Pools with a dynamic-fee plugin set the rate inside every swap without emitting it, so the rate is read from slot0 at the end of each hourly window.",
  UserFees: "Traders pay every swap fee.",
  Revenue: "The protocol's share of swap fees, set per pool and per token in basis points of the fee.",
  ProtocolRevenue: "The protocol's share of swap fees.",
  SupplySideRevenue: "The part of swap fees the protocol does not take, which accrues to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap amount times the pool's fee rate, taken in the coin the pool's feeToken setting names.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Traders pay every swap fee, so this is the same figure as Fees.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "Swap fees times the pool's protocol share for the coin the fee was taken in (slot0.feeProtocol0 or feeProtocol1).",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: "The protocol's share of swap fees, which is all of Revenue: nothing else accrues to the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "Swap fees not taken by the protocol, earned by liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-15",
  methodology,
  breakdownMethodology,
};

export default adapter;
