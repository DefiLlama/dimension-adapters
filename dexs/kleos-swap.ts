import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// KleosSwap: the Uniswap v3 fork of the Kleos launchpad (https://thekleos.pro, https://x.com/TheKleos_) on Elysium.
// Taxed coins are a separate listing: fees/kleos-launchpad.
// Sources: https://github.com/aidaonsui-collab/flux (app/src/config/deployments/99901.json)

const KLEOSSWAP_FACTORY = "0x809ff79945FfFbf9B8Df33Bb3B62872CEB2efaF1";
const KLEOSSWAP_FROM_BLOCK = 7700; // before the factory's first pool
const KLEOS_WHYPE = "0x0269031ace34a7821e9d9980d087c35ce7c19eef"; // Kleos's own wrapped HYPE, not the coreAssets WHYPE
const KLEOSSWAP_POSITION_MANAGER = "0x59c3630B078D2c561AB69c990987C9F13E90eD37";
const KLEOS_TREASURY = "0x4116ccc1cc2b34953f73413c4747c954f49c179b"; // receives 10% of LP fees collected through Kleos's page
// coreBpsOf only exists on the second launchpad; deployBlock is the first block with code
const LAUNCHPADS = [
  { address: "0x7700Cb672BbD853CF57e82Ea14C3ebBaAc3ec470", deployBlock: 7747, coreShare: false },
  { address: "0x6E3AFDdc49f5D43858a1FDD48184426deD11029b", deployBlock: 12291, coreShare: true },
];

const LABEL = {
  lpFees: "KleosSwap LP Fees",
  toPlatform: "Fees To Platform",
  toCreators: "Fees To Creators",
  toCoinBuyback: "Fees To Coin Buyback And Burn",
  toCoreFund: "Fees To Road To Core Fund",
  coinSideBurned: "Coin-Side LP Fees Burned",
  toLps: "LP Fees To Liquidity Providers",
  lpInterfaceFee: "Kleos Share Of LP Fees Collected",
};

const V3_POOL_CREATED = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const V3_SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const V3_COLLECT = "event Collect(address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)";
const NPM_POSITIONS = "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)";
const GET_LAUNCH = "function getLaunch(address token) view returns ((address creator, uint64 createdAt, uint64 createdBlock, bool tokenIsToken0, uint16 creatorShareBps, uint16 buybackBps, uint64 windowEndsAt, address pool, uint256 positionId, int24 tickLower, int24 tickUpper, uint256 startMarketCap))";
const CORE_BPS_OF = "function coreBpsOf(address token) view returns (uint16)";
const V3_SLOT0 = "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";
const V3_FEE_GROWTH_0 = "function feeGrowthGlobal0X128() view returns (uint256)";
const V3_FEE_GROWTH_1 = "function feeGrowthGlobal1X128() view returns (uint256)";
const V3_TICKS = "function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)";

const BPS = 10_000n;
const PIPS = 1_000_000n; // Uniswap fee unit
const Q128 = 1n << 128n;
const WORD = 1n << 256n;
const mod256 = (x: bigint) => ((x % WORD) + WORD) % WORD;
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const lower = (a: string) => String(a).toLowerCase();

// Elysium getLogs can return the same log twice when it splits a range
const dedupeLogs = (logs: any[]) => {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${lower(log.transactionHash)}-${Number(log.logIndex)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// By event signature and filtered by pool: far fewer RPC calls than `targets` over every pool (no indexer on Elysium)
async function poolLogs(options: FetchOptions, eventAbi: string, pools: Record<string, unknown>) {
  const logs = await options.getLogs({ noTarget: true, eventAbi, onlyArgs: false });
  return dedupeLogs(logs.filter((log: any) => pools[lower(log.address)]));
}

// Uniswap v3 feeGrowthInside of each pool's launch range, both tokens
async function feeGrowthInside(api: ChainApi, pools: string[], launchOf: Record<string, any>) {
  const slots = await api.multiCall({ abi: V3_SLOT0, calls: pools });
  const global0 = await api.multiCall({ abi: V3_FEE_GROWTH_0, calls: pools });
  const global1 = await api.multiCall({ abi: V3_FEE_GROWTH_1, calls: pools });
  const lo = await api.multiCall({ abi: V3_TICKS, calls: pools.map((p) => ({ target: p, params: [launchOf[p].tickLower] })) });
  const hi = await api.multiCall({ abi: V3_TICKS, calls: pools.map((p) => ({ target: p, params: [launchOf[p].tickUpper] })) });
  const growth: Record<string, [bigint, bigint]> = {};
  pools.forEach((p, i) => {
    const tick = Number(slots[i].tick);
    const inside = (global: bigint, outLower: bigint, outUpper: bigint) => {
      const below = tick >= Number(launchOf[p].tickLower) ? outLower : global - outLower;
      const above = tick < Number(launchOf[p].tickUpper) ? outUpper : global - outUpper;
      return mod256(global - below - above);
    };
    growth[p] = [
      inside(BigInt(global0[i]), BigInt(lo[i].feeGrowthOutside0X128), BigInt(hi[i].feeGrowthOutside0X128)),
      inside(BigInt(global1[i]), BigInt(lo[i].feeGrowthOutside1X128), BigInt(hi[i].feeGrowthOutside1X128)),
    ];
  });
  return growth;
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const pools: Record<string, { coin: string; hypeIs0: boolean; fee: bigint }> = {};
  const created = await options.getLogs({ target: KLEOSSWAP_FACTORY, eventAbi: V3_POOL_CREATED, fromBlock: KLEOSSWAP_FROM_BLOCK, cacheInCloud: true });
  for (const p of created) {
    const hypeIs0 = lower(p.token0) === KLEOS_WHYPE;
    if (hypeIs0 || lower(p.token1) === KLEOS_WHYPE) pools[lower(p.pool)] = { coin: lower(hypeIs0 ? p.token1 : p.token0), hypeIs0, fee: BigInt(p.fee) };
  }

  // Buys pay the fee in HYPE; sells pay it in the coin, valued at fee / (1 - fee) of the HYPE paid out
  const fees: Record<string, { hype: bigint; coin: bigint; coinInHype: bigint }> = {};
  for (const s of await poolLogs(options, V3_SWAP, pools)) {
    const pool = pools[lower(s.address)];
    const hype = BigInt(pool.hypeIs0 ? s.args.amount0 : s.args.amount1);
    const coin = BigInt(pool.hypeIs0 ? s.args.amount1 : s.args.amount0);
    const f = (fees[lower(s.address)] ??= { hype: 0n, coin: 0n, coinInHype: 0n });
    if (hype > 0n) {
      f.hype += (hype * pool.fee) / PIPS;
      dailyVolume.addGasToken(hype);
    } else if (hype < 0n) {
      const feeInHype = (-hype * pool.fee) / (PIPS - pool.fee);
      f.coin += (coin * pool.fee) / PIPS;
      f.coinInHype += feeInHype;
      dailyVolume.addGasToken(-hype + feeInHype);
    }
  }

  // The launch that owns each pool's locked position
  const toBlock = await options.getToBlock();
  const asks = LAUNCHPADS.filter((lp) => lp.deployBlock <= toBlock).flatMap((lp) => Object.keys(fees).map((p) => ({ lp, p })));
  const launches = await options.api.multiCall({ abi: GET_LAUNCH, calls: asks.map(({ lp, p }) => ({ target: lp.address, params: [pools[p].coin] })) });
  const launchOf: Record<string, any> = {};
  asks.forEach(({ lp, p }, i) => {
    if (lower(launches[i].pool) === p) launchOf[p] = { ...launches[i], lp, coreBps: 0 };
  });
  const withCore = Object.keys(launchOf).filter((p) => launchOf[p].lp.coreShare);
  const cores = await options.api.multiCall({ abi: CORE_BPS_OF, calls: withCore.map((p) => ({ target: launchOf[p].lp.address, params: [pools[p].coin] })) });
  withCore.forEach((p, i) => (launchOf[p].coreBps = cores[i]));
  const launched = Object.keys(launchOf);
  const positions = await options.api.multiCall({ target: KLEOSSWAP_POSITION_MANAGER, abi: NPM_POSITIONS, calls: launched.map((p) => launchOf[p].positionId) });

  // Launch position's fees = liquidity x feeGrowthInside delta; start is the block before the window, 0 for pools launched in it
  const fromBlock = await options.getFromBlock();
  const older = launched.filter((p) => Number(launchOf[p].createdBlock) < fromBlock);
  const start = await feeGrowthInside(new ChainApi({ chain: options.chain, block: fromBlock - 1 }), older, launchOf);
  const end = await feeGrowthInside(options.toApi, launched, launchOf);
  const earned: Record<string, { hype: bigint; coin: bigint }> = {};
  launched.forEach((p, i) => {
    const [s0, s1] = start[p] ?? [0n, 0n];
    const fee0 = (BigInt(positions[i].liquidity) * mod256(end[p][0] - s0)) / Q128;
    const fee1 = (BigInt(positions[i].liquidity) * mod256(end[p][1] - s1)) / Q128;
    earned[p] = pools[p].hypeIs0 ? { hype: fee0, coin: fee1 } : { hype: fee1, coin: fee0 };
  });

  for (const [p, f] of Object.entries(fees)) {
    const launch = launchOf[p];
    const launchHype = min(earned[p]?.hype ?? 0n, f.hype);
    // coin side is unpriced: valued as its share of the pool's coin fees
    const burned = f.coin > 0n ? (f.coinInHype * min(earned[p]?.coin ?? 0n, f.coin)) / f.coin : 0n;
    dailyFees.addGasToken(f.hype + f.coinInHype, LABEL.lpFees);
    dailySupplySideRevenue.addGasToken(f.hype + f.coinInHype - launchHype - burned, LABEL.toLps);
    dailySupplySideRevenue.addGasToken(burned, LABEL.coinSideBurned);
    if (!launch || !launchHype) continue;
    const creatorSide = (launchHype * BigInt(launch.creatorShareBps)) / BPS;
    const buyback = (creatorSide * BigInt(launch.buybackBps)) / BPS;
    const core = (launchHype * BigInt(launch.coreBps)) / BPS;
    const platform = launchHype - creatorSide - core;
    dailySupplySideRevenue.addGasToken(creatorSide - buyback, LABEL.toCreators);
    dailySupplySideRevenue.addGasToken(buyback, LABEL.toCoinBuyback);
    dailySupplySideRevenue.addGasToken(core, LABEL.toCoreFund);
    dailyRevenue.addGasToken(platform, LABEL.toPlatform);
    dailyProtocolRevenue.addGasToken(platform, LABEL.toPlatform);
  }

  // Kleos's 10% of LP fees collected through its page, moved out of the LPs' share
  for (const c of await poolLogs(options, V3_COLLECT, pools)) {
    const pool = pools[lower(c.address)];
    const hype = BigInt(pool.hypeIs0 ? c.args.amount0 : c.args.amount1);
    if (lower(c.args.recipient) !== KLEOS_TREASURY || !hype) continue;
    dailyRevenue.addGasToken(hype, LABEL.lpInterfaceFee);
    dailyProtocolRevenue.addGasToken(hype, LABEL.lpInterfaceFee);
    dailySupplySideRevenue.subtractToken(ADDRESSES.null, hype, LABEL.toLps);
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
  Volume: "Value of every trade on KleosSwap, on its HYPE leg and before the 1% pool fee.",
  Fees: "KleosSwap's 1% pool fee, paid by traders on every trade.",
  UserFees: "The 1% pool fee traders pay on every trade.",
  Revenue: "Kleos's part of the pool fees earned by the locked launch positions of coins launched on Kleos, and its 10% of the LP fees other providers collect through Kleos's liquidity page (HYPE side).",
  ProtocolRevenue: "Kleos's part of the launch positions' pool fees and its 10% of LP fees collected through Kleos's page, kept by the platform.",
  SupplySideRevenue: "Pool fees to each launched coin's creator, its buyback & burn and the Road to Core fund, the coin side of launch positions' fees (burned), and the LP fees other liquidity providers earn, less Kleos's 10% of what they collect through its page.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.lpFees]: "KleosSwap's 1% pool fee on every trade.",
  },
  UserFees: {
    [LABEL.lpFees]: "KleosSwap pool fee paid by traders.",
  },
  Revenue: {
    [LABEL.toPlatform]: "The platform's share of launch positions' HYPE-side pool fees.",
    [LABEL.lpInterfaceFee]: "10% of the LP fees other providers collect through Kleos's liquidity page (HYPE side), paid to the platform in the collect.",
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "The platform's share of launch positions' HYPE-side pool fees, kept by the platform.",
    [LABEL.lpInterfaceFee]: "10% of the LP fees collected through Kleos's liquidity page (HYPE side).",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "The coin creator's share of its launch position's HYPE-side fees.",
    [LABEL.toCoinBuyback]: "Part of the creator's share set aside to buy back and burn the coin.",
    [LABEL.toCoreFund]: "Road to Core share of launch positions' HYPE-side fees (coreBpsOf).",
    [LABEL.coinSideBurned]: "Launch positions' fees paid in the coin, burned by the launchpad.",
    [LABEL.toLps]: "LP fees earned by liquidity providers other than the launch position (the pool's fees less what the launch position earned), less the platform's 10% of what's collected through Kleos's page.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
