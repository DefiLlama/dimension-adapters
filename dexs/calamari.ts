import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { isCoreAsset } from "../helpers/prices";

// Calamari runs its own Uniswap v4 deployment on Ink, it is not a hook on the
// canonical PoolManager: https://calamari.trade
const POOL_MANAGER = "0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560";
const STATE_VIEW = "0x9Bf3f07e41e05D658248467760C745E278EF6211";
// Block the PoolManager was deployed in, tx 0x0e3e5b7be809fb3b7adabf0ee9ae32897c6a8b05a6f2a8c00a0c128783ac2eda
const POOL_MANAGER_DEPLOY_BLOCK = 54652108;

const NATIVE = "0x0000000000000000000000000000000000000000";

const initializeEvent =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const swapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const slot0Abi =
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)";

// v4 fee rates are in pips
const PIPS = 1_000_000n;
// protocolFee packs the two swap directions into 12 bits each:
// https://github.com/Uniswap/v4-core/blob/main/src/libraries/ProtocolFeeLibrary.sol
const PROTOCOL_FEE_MASK = 0xfffn;
const PROTOCOL_FEE_SHIFT = 12n;

const isPriced = (chain: string, token: string) =>
  token === NATIVE || isCoreAsset(chain, token);

const abs = (v: bigint) => (v < 0n ? -v : v);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const initLogs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: initializeEvent,
    fromBlock: POOL_MANAGER_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const pools: Record<string, [string, string]> = {};
  initLogs.forEach((log: any) => {
    pools[String(log.id).toLowerCase()] = [log.currency0, log.currency1];
  });

  const swapLogs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: swapEvent,
  });

  const tradedPoolIds = [
    ...new Set(swapLogs.map((log: any) => String(log.id).toLowerCase())),
  ].filter((id) => pools[id]);
  if (!tradedPoolIds.length)
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const slot0s = await options.api.multiCall({
    target: STATE_VIEW,
    abi: slot0Abi,
    calls: tradedPoolIds,
  });

  const protocolFees: Record<string, bigint> = {};
  tradedPoolIds.forEach((id, i) => {
    protocolFees[id] = BigInt(slot0s[i].protocolFee);
  });

  swapLogs.forEach((log: any) => {
    const id = String(log.id).toLowerCase();
    const pool = pools[id];
    if (!pool) return;

    const amount0 = BigInt(log.amount0);
    const amount1 = BigInt(log.amount1);
    // v4 emits the delta owed to the swapper: the negative side is what they pay in
    const zeroForOne = amount0 < 0n;
    const [inputToken, inputAmount] = zeroForOne
      ? [pool[0], abs(amount0)]
      : [pool[1], abs(amount1)];

    const packed = protocolFees[id] ?? 0n;
    const protocolFeeRate = zeroForOne
      ? packed & PROTOCOL_FEE_MASK
      : (packed >> PROTOCOL_FEE_SHIFT) & PROTOCOL_FEE_MASK;

    const totalFee = (inputAmount * BigInt(log.fee)) / PIPS;
    const protocolFee = (inputAmount * protocolFeeRate) / PIPS;
    const lpFee = totalFee > protocolFee ? totalFee - protocolFee : 0n;

    // long-tail launch tokens have no reliable price, so only trades with a
    // priceable leg are counted and the fee is booked in that same currency
    if (isPriced(options.chain, inputToken)) {
      dailyVolume.add(inputToken, inputAmount);
      dailyFees.add(inputToken, totalFee, "Swap Fees");
      dailyRevenue.add(inputToken, protocolFee, "Swap Fees To Treasury");
      dailySupplySideRevenue.add(inputToken, lpFee, "Swap Fees To LPs");
      return;
    }

    const outputToken = zeroForOne ? pool[1] : pool[0];
    const outputAmount = zeroForOne ? abs(amount1) : abs(amount0);
    if (!isPriced(options.chain, outputToken)) return;

    dailyVolume.add(outputToken, outputAmount);
    // the fee is charged on the input leg, so it is converted at the swap's own rate
    const scale = (v: bigint) =>
      inputAmount === 0n ? 0n : (v * outputAmount) / inputAmount;
    dailyFees.add(outputToken, scale(totalFee), "Swap Fees");
    dailyRevenue.add(outputToken, scale(protocolFee), "Swap Fees To Treasury");
    dailySupplySideRevenue.add(outputToken, scale(lpFee), "Swap Fees To LPs");
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Sum of the priceable leg of every swap emitted by the Calamari PoolManager on Ink.",
  Fees: "Each swap's fee, taken from the swap's own fee rate as emitted in the Swap event.",
  UserFees: "Traders pay the pool fee on every swap.",
  Revenue: "The v4 protocol fee share of each swap, read per pool and per direction from the PoolManager's slot0.",
  ProtocolRevenue: "All of it: no token receives a share of Calamari's fees.",
  SupplySideRevenue: "The remainder of the swap fee, which accrues to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Pool fees paid by traders on Calamari v4 pools.",
  },
  UserFees: {
    "Swap Fees": "Pool fees paid by traders on Calamari v4 pools.",
  },
  Revenue: {
    "Swap Fees To Treasury": "Protocol fee share collected by the PoolManager.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "Pool fees distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INK],
  start: "2026-08-29",
  methodology,
  breakdownMethodology,
};

export default adapter;
