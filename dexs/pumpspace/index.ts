import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { isCoreAsset } from "../../helpers/prices";

/**
 * PumpSpace V2 DEX Adapter (Uniswap V2 fork)
 *
 * Factory: 0x26B42c208D8a9d8737A2E5c9C57F4481484d4616
 *
 * Fee model:
 * - Total swap fee: 0.5% (0.005)
 * - 50% of fee (0.25% = 0.0025) sent to feeTo (protocol treasury)
 * - 50% of fee (0.25% = 0.0025) to LPs as supply-side rewards
 *
 * Reference (from contract):
 * function calculateFee(uint256 amount, address swapFeeTo) internal view returns (uint256) {
 *     uint256 swapFeeRate = IDexFactory(factory).swapFeeRate(); // 2
 *     if (swapFeeTo != address(0)) {
 *         uint256 feeAmount = (amount * 5) / 1000;  // 0.5%
 *         uint256 feeToReceive = feeAmount / swapFeeRate;  // /2 = 0.25%
 *         return feeToReceive;
 *     }
 * }
 */
const V2_FACTORY = "0x26B42c208D8a9d8737A2E5c9C57F4481484d4616";

/**
 * PumpSpace V3 (Trident concentrated liquidity)
 *
 * MiningPoolFactory (mainnet): 0xE749c1cA2EA4f930d1283ad780AdE28625037CeD
 * PoolLogger (mainnet):        0x77c8dfFE4130FE58e5C3c02a2E7ab6DB7f4F474f
 *
 * Protocol fee split:
 * - defaultProtocolFee() = 2000 (bps) -> 20% of fees to protocol
 * - remaining 80% to LPs
 */
const V3_POOL_FACTORY = "0xE749c1cA2EA4f930d1283ad780AdE28625037CeD";
const V3_POOL_LOGGER = "0x77c8dfFE4130FE58e5C3c02a2E7ab6DB7f4F474f";

// PoolLogger: event Swap(address indexed pool, bool zeroForOne, uint256 amountIn, uint256 amountOut)
const V3_SWAP_EVENT =
  "event Swap(address indexed pool, bool zeroForOne, uint256 amountIn, uint256 amountOut)";

// --------------------
// V2 fetch (as-is)
// --------------------
const fetchV2 = getUniV2LogAdapter({
  factory: V2_FACTORY,
  fees: 0.005, // total user fees = 0.5%
  userFeesRatio: 1, // 100% of 0.5% is paid by user
  revenueRatio: 0.5, // 50% of total fees go to protocol (0.25% of volume)
  protocolRevenueRatio: 0.5, // 50% of total fees go to protocol treasury
  supplySideRevenueRatio: 0.5, // 50% of total fees go to LPs
});

// --------------------
// V3 fetch (PoolLogger-based, Trident CL)
// --------------------
const fetchV3: FetchV2 = async (options: FetchOptions) => {
  const { createBalances, getLogs, api, chain } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances(); // not used

  // Pull protocol fee split (bps). Confirmed on-chain: defaultProtocolFee() == 2000 (20%)
  let protocolFeeBps = 2000n;
  try {
    const v = await api.call({
      target: V3_POOL_FACTORY,
      abi: "function defaultProtocolFee() view returns (uint256)",
    });
    protocolFeeBps = BigInt(v.toString());
  } catch {
    // fallback to 2000 bps
  }

  // 10,000 bps = 100%
  const PROTOCOL_FEE_DENOMINATOR = 10_000n;

  // swapFee() is in "pips": 1000 = 0.1% => 1,000,000 = 100%
  const SWAP_FEE_DENOMINATOR = 1_000_000n;

  // Load swap logs from PoolLogger for the requested time window
  const logs: any[] = await getLogs({
    target: V3_POOL_LOGGER,
    eventAbi: V3_SWAP_EVENT,
  });

  if (!logs.length) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees.clone(1),
      dailyRevenue: dailyProtocolRevenue.clone(1),
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue,
    };
  }

  // Unique pool list from logs
  const pools = [...new Set(logs.map((l) => (l.pool as string).toLowerCase()))];

  // Read pool metadata directly from the pool (IConcentratedLiquidityPool)
  const [token0s, token1s, swapFees] = await Promise.all([
    api.multiCall({ abi: "address:token0", calls: pools, permitFailure: true }),
    api.multiCall({ abi: "address:token1", calls: pools, permitFailure: true }),
    api.multiCall({
      abi: "function swapFee() view returns (uint24)",
      calls: pools,
      permitFailure: true,
    }),
  ]);

  const meta = new Map<
    string,
    { token0: string; token1: string; feePips: bigint }
  >();

  for (let i = 0; i < pools.length; i++) {
    const token0 = token0s[i];
    const token1 = token1s[i];
    const fee = swapFees[i];

    // token0/token1 must exist to count volume
    if (!token0 || !token1) continue;

    // swapFee might fail; if so, treat as 0 (volume ok, fees skipped)
    const feePips =
      fee === null || fee === undefined ? 0n : BigInt(fee.toString());

    meta.set(pools[i], {
      token0,
      token1,
      feePips,
    });
  }

  // Aggregate balances from logs
  for (const log of logs) {
    const pool = (log.pool as string).toLowerCase();
    const m = meta.get(pool);
    if (!m) continue;

    const amountIn = BigInt(log.amountIn.toString());
    const amountOut = BigInt(log.amountOut.toString());
    const zeroForOne = Boolean(log.zeroForOne);

    // zeroForOne: token0 -> token1
    // token0 amount exchanged:
    // - if zeroForOne: token0 = amountIn
    // - else: token0 = amountOut
    const amount0 = zeroForOne ? amountIn : amountOut;

    // token1 amount exchanged:
    // - if zeroForOne: token1 = amountOut
    // - else: token1 = amountIn
    const amount1 = zeroForOne ? amountOut : amountIn;

    // Count volume on the core-asset side (better pricing coverage)
    const useToken0 = isCoreAsset(chain, m.token0);
    const baseToken = useToken0 ? m.token0 : m.token1;
    const baseAmount = useToken0 ? amount0 : amount1;

    if (baseAmount > 0n) dailyVolume.add(baseToken, baseAmount);

    // Total fees (in base token units)
    const feeAmount = (baseAmount * m.feePips) / SWAP_FEE_DENOMINATOR;
    if (feeAmount <= 0n) continue;

    dailyFees.add(baseToken, feeAmount);

    // Split fees: protocol vs LPs
    const protocolFeeAmount =
      (feeAmount * protocolFeeBps) / PROTOCOL_FEE_DENOMINATOR;
    const lpFeeAmount = feeAmount - protocolFeeAmount;

    if (protocolFeeAmount > 0n)
      dailyProtocolRevenue.add(baseToken, protocolFeeAmount);
    if (lpFeeAmount > 0n) dailySupplySideRevenue.add(baseToken, lpFeeAmount);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1), // user pays total fees
    dailyRevenue: dailyProtocolRevenue.clone(1), // protocol revenue
    dailyProtocolRevenue, // treasury share (protocol)
    dailySupplySideRevenue, // LP share
    dailyHoldersRevenue, // none
  };
};

// --------------------
// V2 + V3 merge
// --------------------
const fetch: FetchV2 = async (options: FetchOptions) => {
  const [v2, v3] = await Promise.all([fetchV2(options), fetchV3(options)]);

  const outDailyVolume = options.createBalances();
  const outDailyFees = options.createBalances();
  const outDailyUserFees = options.createBalances();
  const outDailyRevenue = options.createBalances();
  const outDailyProtocolRevenue = options.createBalances();
  const outDailySupplySideRevenue = options.createBalances();
  const outDailyHoldersRevenue = options.createBalances();

  const merge = (dst: any, src: any) => {
    if (!src) return;
    if (typeof src === "object" && typeof dst.addBalances === "function")
      dst.addBalances(src);
  };

  merge(outDailyVolume, v2.dailyVolume);
  merge(outDailyVolume, v3.dailyVolume);

  merge(outDailyFees, v2.dailyFees);
  merge(outDailyFees, v3.dailyFees);

  merge(outDailyUserFees, v2.dailyUserFees);
  merge(outDailyUserFees, v3.dailyUserFees);

  merge(outDailyRevenue, v2.dailyRevenue);
  merge(outDailyRevenue, v3.dailyRevenue);

  merge(outDailyProtocolRevenue, v2.dailyProtocolRevenue);
  merge(outDailyProtocolRevenue, v3.dailyProtocolRevenue);

  merge(outDailySupplySideRevenue, v2.dailySupplySideRevenue);
  merge(outDailySupplySideRevenue, v3.dailySupplySideRevenue);

  merge(outDailyHoldersRevenue, v2.dailyHoldersRevenue);
  merge(outDailyHoldersRevenue, v3.dailyHoldersRevenue);

  return {
    dailyVolume: outDailyVolume,
    dailyFees: outDailyFees,
    dailyUserFees: outDailyUserFees,
    dailyRevenue: outDailyRevenue,
    dailyProtocolRevenue: outDailyProtocolRevenue,
    dailySupplySideRevenue: outDailySupplySideRevenue,
    dailyHoldersRevenue: outDailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.AVAX],
  start: "2024-12-23",
  methodology: {
    Volume:
      "DEX swap volume on PumpSpace (V2 + Trident V3) on Avalanche. V2 uses pair Swap logs from the V2 factory. V3 uses PoolLogger Swap(pool, zeroForOne, amountIn, amountOut) logs and reads token0/token1/swapFee from each concentrated liquidity pool.",
    Fees: "V2 charges 0.5% per swap split 50% LP / 50% protocol treasury. V3 fees are estimated using each pool's swapFee() (pips where 1e6 = 100%).",
    UserFees: "Users pay V2 0.5% and V3 swapFee() per swap.",
    Revenue:
      "Protocol-side fees. V2: 50% of total fees. V3: protocol share is determined by MiningPoolFactory.defaultProtocolFee() (bps, currently 2000 = 20% of fees).",
    ProtocolRevenue:
      "Treasury share of fees. V2: 50% of fees. V3: defaultProtocolFee() share (currently 20% of fees).",
    SupplySideRevenue:
      "Liquidity providers' share of fees. V2: 50%. V3: remaining share after protocol fee (currently 80% of fees).",
  },
  fetch,
};

export default adapter;
