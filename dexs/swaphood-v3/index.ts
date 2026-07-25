import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken, isCoreAsset } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";

// SwapHood V3 is a gauge-based (ve(3,3)) concentrated-liquidity DEX on Robinhood Chain.
// Fee routing depends on whether a pool is registered in the MasterChef gauge registry,
// exactly like SwapHood V2 (see dexs/swaphood-v2):
//   gauged pool   -> 100% of swap fees are protocol revenue: 5% retained, 95% to holders.
//                    LPs in gauged pools are compensated with emissions, not swap fees.
//   ungauged pool -> 100% of swap fees stay with the liquidity providers.
// The uniV3 factory helper can only apply one static split to every pool, so gauge state
// is resolved per pool here instead.

// SwapHood V3 factory, the only source of v3 pools on Robinhood Chain.
// https://robinhoodchain.blockscout.com/address/0x0Ec554F0BfF0Be6C99d1e95C8015bb0950f6A2C7
const FACTORY = "0x0Ec554F0BfF0Be6C99d1e95C8015bb0950f6A2C7";
// SwapHood MasterChef, the gauge registry. Same contract dexs/swaphood-v2 reads.
// https://robinhoodchain.blockscout.com/address/0x734c9ef24AEeb9654Be9A19f6d3991b5D91c587B
const MASTERCHEF = "0x734c9ef24AEeb9654Be9A19f6d3991b5D91c587B";
// Block of the first PoolCreated on the factory above, 2026-07-11 14:38:23 UTC.
const FACTORY_FROM_BLOCK = 7020627;
// gauges() returns this for any address that was never registered in the MasterChef.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Pool fee tiers are stored as a uint24 in hundredths of a basis point (500 = 0.05%),
// so the raw value has to be divided by 1e6 to get a fraction of the swap amount.
const FEE_TIER_DENOMINATOR = 1e6;

const PROTOCOL_SHARE = 0.05; // retained by the protocol; the remaining 95% goes to holders

const POOL_CREATED_EVENT =
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
// SwapHood V3 pools emit the PancakeSwap-style Swap event carrying the protocol-fee fields.
const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)";

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  PROTOCOL_REVENUE: "Swap Fees Retained By Protocol",
  HOLDERS_REVENUE: "Swap Fees Distributed To Holders",
  LP_REVENUE: "Swap Fees To Liquidity Providers",
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getLogs, chain } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolLogs = await getLogs({
    target: FACTORY,
    eventAbi: POOL_CREATED_EVENT,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });

  // Same TVL filter the uniV3 factory helper applies, so switching to this adapter
  // changes only the fee split and not the set of pools counted.
  const pairObject: Record<string, string[]> = {};
  const poolMeta: Record<string, { token0: string; token1: string; feeTier: number }> = {};
  for (const log of poolLogs) {
    pairObject[log.pool] = [log.token0, log.token1];
    poolMeta[String(log.pool).toLowerCase()] = { token0: log.token0, token1: log.token1, feeTier: Number(log.fee) / FEE_TIER_DENOMINATOR };
  }

  const filtered = await filterPools({ api, pairs: pairObject, createBalances });
  const pools = Object.keys(filtered);
  if (!pools.length)
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };

  const gauges = await api.multiCall({
    target: MASTERCHEF,
    abi: "function gauges(address) view returns (address)",
    calls: pools,
  });

  const swapLogs = await getLogs({ targets: pools, eventAbi: SWAP_EVENT, flatten: false });

  // The swap fee is charged on the token flowing into the pool, which is the leg with the
  // positive amount in the Swap event. Confirmed on chain: protocolFeesToken0/protocolFeesToken1
  // are only ever non-zero on that positive leg, and they come out to exactly the pool's
  // feeProtocol share of (positive amount * feeTier).
  //
  // addOneToken on its own picks whichever leg is a core asset and takes its absolute value, so
  // it lands on the output leg whenever the core asset is the token leaving the pool (2408 of
  // 4494 swaps in a sampled 24h window). Prefer the input leg when that token is a core asset.
  // When it is not, keep addOneToken's behaviour: valuing the fee on the core-asset output leg
  // converts it at the pool's own exchange rate, which is far better than booking the fee in a
  // token that has no price feed and having it count as zero.
  const addSwapFee = (token0: string, token1: string, amount0: any, amount1: any, feeTier: number) => {
    const token0IsInput = Number(amount0) > 0;
    const inputToken = token0IsInput ? token0 : token1;
    if (isCoreAsset(chain, inputToken)) {
      const amount = Math.abs(Number(token0IsInput ? amount0 : amount1)) * feeTier;
      dailyFees.add(inputToken, amount, METRIC.SWAP_FEES);
      return { token: inputToken, amount };
    }
    return addOneToken({
      chain, balances: dailyFees, token0, token1,
      amount0: Number(amount0) * feeTier,
      amount1: Number(amount1) * feeTier,
      label: METRIC.SWAP_FEES,
    });
  };

  swapLogs.forEach((logs: any[], i: number) => {
    if (!logs.length) return;
    const meta = poolMeta[String(pools[i]).toLowerCase()];
    if (!meta) return;
    const { token0, token1, feeTier } = meta;
    const isGauged = String(gauges[i]).toLowerCase() !== ZERO_ADDRESS;

    for (const log of logs) {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });

      const swapFee = addSwapFee(token0, token1, log.amount0, log.amount1, feeTier);
      if (!swapFee?.amount) continue;

      const { token, amount } = swapFee;
      if (isGauged) {
        // Take the holders' share as the remainder rather than amount * 0.95, so the two
        // labels add back to exactly the fee that went into dailyFees. amount * 0.05 plus
        // amount * 0.95 misses amount by a float ULP for roughly a quarter of magnitudes.
        const protocolAmount = amount * PROTOCOL_SHARE;
        const holdersAmount = amount - protocolAmount;
        dailyRevenue.add(token, protocolAmount, METRIC.PROTOCOL_REVENUE);
        dailyRevenue.add(token, holdersAmount, METRIC.HOLDERS_REVENUE);
        dailyProtocolRevenue.add(token, protocolAmount, METRIC.PROTOCOL_REVENUE);
        dailyHoldersRevenue.add(token, holdersAmount, METRIC.HOLDERS_REVENUE);
      } else {
        dailySupplySideRevenue.add(token, amount, METRIC.LP_REVENUE);
      }
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Swap volume across all SwapHood V3 pools on Robinhood Chain.",
  Fees: "Trading fees paid by users, taken at each pool's own fee tier.",
  UserFees: "All trading fees are paid by the traders.",
  Revenue: "Fees from pools registered in the SwapHood MasterChef gauge: 5% is retained by the protocol and 95% is distributed to holders. Pools without a gauge pay their fees to liquidity providers instead and are excluded here.",
  ProtocolRevenue: "5% of the swap fees from gauged pools.",
  HoldersRevenue: "95% of the swap fees from gauged pools.",
  SupplySideRevenue: "100% of the swap fees from pools that are not registered in a gauge, which go to liquidity providers.",
};

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Trading fees taken at each pool's own fee tier." },
  UserFees: { [METRIC.SWAP_FEES]: "Trading fees paid by traders." },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]: "5% of swap fees from gauged pools, retained by the protocol.",
    [METRIC.HOLDERS_REVENUE]: "95% of swap fees from gauged pools, distributed to holders.",
  },
  ProtocolRevenue: { [METRIC.PROTOCOL_REVENUE]: "5% of swap fees from gauged pools." },
  HoldersRevenue: { [METRIC.HOLDERS_REVENUE]: "95% of swap fees from gauged pools." },
  SupplySideRevenue: { [METRIC.LP_REVENUE]: "Swap fees from ungauged pools, which stay with liquidity providers." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-11",
  methodology,
  breakdownMethodology,
};

export default adapter;
