import { CHAIN } from "../../helpers/chains";
import { getMetricFactoriesAdapter, MetricEvents, MetricFactoriesChainConfig, MetricFactory, MetricFees } from "./utils";

// Both generations share the PoolCreated layout (the newer one only renamed a
// few fields), so the same ABI decodes either factory's events.
const poolCreatedEvent =
  "event PoolCreated(address indexed poolAddress, address indexed token0, address indexed token1, uint256 poolIdx, address factory, address admin, address priceProvider, address[] extensions, (uint256 beforeAddLiquidity,uint256 afterAddLiquidity,uint256 beforeRemoveLiquidity,uint256 afterRemoveLiquidity,uint256 beforeSwap,uint256 afterSwap) extensionOrders, uint256 priceProviderTimelock, uint256 initialScaledAmount0PerE18Shares, uint256 initialScaledAmount1PerE18Shares, uint256 minimalOperationalLiquidity, uint24 spreadProtocolFeeE6, uint24 protocolNotionalFeeE8, uint24 adminSpreadFeeE6, uint24 adminNotionalFeeE8, address adminFeeDestination, int24 curBinDistFromProvidedPriceE6, uint256[] nonNegativeBinDataArray, uint256[] negativeBinDataArray)";

// Retired factory: Swap carries the two deltas as plain int256 fields. Its pools log no LP fee leg, so no `fees`.
const RETIRED_EVENTS: MetricEvents = {
  poolCreatedEvent,
  poolField: "poolAddress",
  swapEvent:
    "event Swap(address indexed sender, address indexed recipient, bool exactInput, int256 amount0Delta, int256 amount1Delta, int8 newTick, uint104 newPositionInBin, uint256 protocolFeeAmount)",
  swapAmounts: (args) => ({ amount0: BigInt(args.amount0Delta), amount1: BigInt(args.amount1Delta) }),
};

// Current factory: Swap packs both deltas into one word — token0 delta in the
// high 128 bits, token1 delta in the low 128 bits, each a two's-complement int128
// (metric-core contracts/types/Packed.sol, Packed2Int128). Verified against live
// Base swaps: sign convention is "positive = the pool gained that token".
const int128At = (word: bigint, shift: number) => BigInt.asIntN(128, word >> BigInt(shift));
const uint128At = (word: bigint, shift: number) => BigInt.asUintN(128, word >> BigInt(shift));

// Fees in scaled input-token units: BinSwapped packs LP (high) and platform (low) legs, Swap packs platform spread (high) and notional (low).
const FEES: MetricFees = {
  binSwappedEvent: "event BinSwapped(int256 binIdx, uint256 binDeltas, uint256 fees)",
  binStep: (args) => {
    const fees = BigInt(args.fees);
    const deltas = BigInt(args.binDeltas);
    return { lp: uint128At(fees, 128), platform: uint128At(fees, 0), amount0: int128At(deltas, 128), amount1: int128At(deltas, 0) };
  },
  platformLegs: (args) => {
    const fees = BigInt(args.platformFees);
    return { spread: uint128At(fees, 128), notional: uint128At(fees, 0) };
  },
  initialConfig: (args) => ({
    protocolSpreadFeeE6: BigInt(args.spreadProtocolFeeE6),
    adminSpreadFeeE6: BigInt(args.adminSpreadFeeE6),
    protocolNotionalFeeE8: BigInt(args.protocolNotionalFeeE8),
    adminNotionalFeeE8: BigInt(args.adminNotionalFeeE8),
  }),
  // Every factory write to poolFeeConfig after creation emits these (setPoolAdminFees, _updatePoolProtocolFee).
  configEvents: [
    { eventAbi: "event PoolProtocolSpreadFeeUpdated(address indexed pool, uint24 newProtocolSpreadFeeE6)", field: "protocolSpreadFeeE6" },
    { eventAbi: "event PoolAdminSpreadFeeUpdated(address indexed pool, uint24 newAdminSpreadFeeE6)", field: "adminSpreadFeeE6" },
    { eventAbi: "event PoolProtocolNotionalFeeUpdated(address indexed pool, uint24 newProtocolNotionalFeeE8)", field: "protocolNotionalFeeE8" },
    { eventAbi: "event PoolAdminNotionalFeeUpdated(address indexed pool, uint24 newAdminNotionalFeeE8)", field: "adminNotionalFeeE8" },
  ],
  poolFeeConfigAbi:
    "function poolFeeConfig(address pool) view returns (uint24 protocolSpreadFeeE6, uint24 adminSpreadFeeE6, uint24 protocolNotionalFeeE8, uint24 adminNotionalFeeE8)",
  immutablesAbi:
    "function getImmutables() view returns ((address factory, address token0, address token1, uint256 token0ScaleMultiplier, uint256 token1ScaleMultiplier, uint256 initialScaledToken0PerShareE18, uint256 initialScaledToken1PerShareE18, uint256 minimalOperationalLiquidity, address immutablePriceProvider, int256 lowestBin, int256 highestBin, address extension1, address extension2, address extension3, address extension4, address extension5, address extension6, address extension7, uint256 beforeAddLiquidityOrder, uint256 afterAddLiquidityOrder, uint256 beforeRemoveLiquidityOrder, uint256 afterRemoveLiquidityOrder, uint256 beforeSwapOrder, uint256 afterSwapOrder))",
};

const EVENTS: MetricEvents = {
  poolCreatedEvent,
  poolField: "poolAddress",
  swapEvent:
    "event Swap(address indexed sender, address indexed recipient, uint256 details, uint256 amountDeltas, uint256 platformFees)",
  swapAmounts: (args) => {
    const deltas = BigInt(args.amountDeltas);
    return { amount0: int128At(deltas, 128), amount1: int128At(deltas, 0) };
  },
  fees: FEES,
};

// Current MetricOmmPoolFactory. Deployed through CreateX to the same address on
// every chain in one wave on 2026-09-15 at ~17:32 UTC and listed as the only
// approved factory in Metric's network config since then. Creation tx / block
// per chain are on the explorers, e.g.
//   https://etherscan.io/address/0x2a53833cc95548cf52c7b159110e22D3a9018f32
//   https://basescan.org/address/0x2a53833cc95548cf52c7b159110e22D3a9018f32
//   https://arbiscan.io/address/0x2a53833cc95548cf52c7b159110e22D3a9018f32
//   https://robinscan.io/address/0x2a53833cc95548cf52c7b159110e22D3a9018f32
//   https://bscscan.com/address/0x2a53833cc95548cf52c7b159110e22D3a9018f32
const FACTORY = "0x2a53833cc95548cf52c7b159110e22D3a9018f32";

// Previous MetricOmmPoolFactory (tracked here since the original listing,
// DefiLlama/dimension-adapters#8449). Retired on 2026-09-22: its pools were
// drained and their price providers switched off, so real flow stopped between
// 2026-09-17 and 2026-09-19; only throw-away test pools traded after that.
//   https://etherscan.io/address/0x622911384e7973439b8be305f5e3Fc3c5736EDe4
//   https://basescan.org/address/0x622911384e7973439b8be305f5e3Fc3c5736EDe4
const RETIRED_FACTORY = "0x622911384e7973439b8be305f5e3Fc3c5736EDe4";

// The retired factory keeps counting for days before RETIRED_END so already
// published history can still be refilled; from that day on only the current
// factory's pools are counted.
const RETIRED_END = "2026-09-22";

const retired = (fromBlock: number): MetricFactory => ({ address: RETIRED_FACTORY, fromBlock, end: RETIRED_END, events: RETIRED_EVENTS });
const current = (fromBlock: number): MetricFactory => ({ address: FACTORY, fromBlock, events: EVENTS });

// fromBlock provenance:
// - retired(): the factory deployment blocks used since #8449.
// - current(): on Ethereum, Base, Arbitrum and MegaETH the first block where
//   eth_getCode(FACTORY) is non-empty (binary search over archive state). On the
//   other chains the public archive did not answer historical eth_getCode, so the
//   block at 2026-09-15 17:31 UTC — one minute before the deployment wave — is
//   used instead; the code is absent there and present within the next ~2,000
//   blocks, so PoolCreated discovery only scans a short empty prefix.
//   Pool counts found via PoolCreated were cross-checked against
//   FACTORY.nextPoolIdx() on 2026-09-24: Ethereum 30, Base 46, Arbitrum 21,
//   Robinhood 51, BSC 14; no pools yet on HyperEVM, Polygon, Avalanche, Monad
//   and MegaETH, where the factory is deployed and approved but idle.
const chainConfig: MetricFactoriesChainConfig = {
  [CHAIN.ETHEREUM]: { start: "2026-07-13", factories: [retired(25524981), current(25984373)] }, // https://etherscan.io/block/25984373
  [CHAIN.BASE]: { start: "2026-07-13", factories: [retired(48585753), current(51352088)] }, // https://basescan.org/block/51352088
  [CHAIN.ARBITRUM]: { start: "2026-07-23", factories: [retired(486842281), current(505490331)] }, // https://arbiscan.io/block/505490331
  [CHAIN.ROBINHOOD]: { start: "2026-07-13", factories: [retired(8800150), current(63834529)] }, // https://robinscan.io/block/63834529
  [CHAIN.HYPERLIQUID]: { start: "2026-09-15", factories: [current(45991045)] }, // https://hyperevmscan.io/block/45991045
  [CHAIN.BSC]: { start: "2026-09-15", factories: [current(122069999)] }, // https://bscscan.com/block/122069999
  [CHAIN.POLYGON]: { start: "2026-09-15", factories: [current(93858951)] }, // https://polygonscan.com/block/93858951
  [CHAIN.AVAX]: { start: "2026-09-15", factories: [current(95361488)] }, // https://snowscan.xyz/block/95361488
  [CHAIN.MONAD]: { start: "2026-09-15", factories: [current(105093301)] }, // https://monadscan.com/block/105093301
  [CHAIN.MEGAETH]: { start: "2026-09-15", factories: [current(26696516)] }, // https://mega.etherscan.io/block/26696516
  // Elysium (Kinetiq's Arbitrum Orbit chain, chain id 99901, explorer
  // https://elysium.kinetiq.xyz/explorer): the factory was deployed on 2026-10-29
  // and 49753 is the first block where eth_getCode(FACTORY) is non-empty (binary
  // search over archive state). The first pool was created on 2026-11-05; 13 pools
  // per FACTORY.nextPoolIdx() on 2026-11-10.
  [CHAIN.ELYSIUM]: { start: "2026-10-29", factories: [current(49753)] },
};

const adapter = getMetricFactoriesAdapter(chainConfig);

export default adapter;
