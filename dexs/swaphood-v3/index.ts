import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";

// SwapHood V3 is a gauge-based (ve(3,3)) concentrated-liquidity DEX on Robinhood Chain.
// Fee routing depends on whether a pool is registered in the MasterChef gauge registry,
// exactly like SwapHood V2 (see dexs/swaphood-v2):
//   gauged pool   -> 100% of swap fees are protocol revenue: 5% retained, 95% to holders.
//                    LPs in gauged pools are compensated with emissions, not swap fees.
//   ungauged pool -> 100% of swap fees stay with the liquidity providers.
// The uniV3 factory helper can only apply one static split to every pool, so gauge state
// is resolved per pool here instead.
const FACTORY = "0x0Ec554F0BfF0Be6C99d1e95C8015bb0950f6A2C7";
const MASTERCHEF = "0x734c9ef24AEeb9654Be9A19f6d3991b5D91c587B";
const FACTORY_FROM_BLOCK = 7020627; // first PoolCreated, 2026-07-11
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PROTOCOL_SHARE = 0.05; // retained by the protocol
const HOLDERS_SHARE = 0.95; // distributed to holders

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
    poolMeta[String(log.pool).toLowerCase()] = { token0: log.token0, token1: log.token1, feeTier: Number(log.fee) / 1e6 };
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

  swapLogs.forEach((logs: any[], i: number) => {
    if (!logs.length) return;
    const meta = poolMeta[String(pools[i]).toLowerCase()];
    if (!meta) return;
    const { token0, token1, feeTier } = meta;
    const isGauged = String(gauges[i]).toLowerCase() !== ZERO_ADDRESS;

    for (const log of logs) {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });

      const swapFee = addOneToken({
        chain, balances: dailyFees, token0, token1,
        amount0: Number(log.amount0) * feeTier,
        amount1: Number(log.amount1) * feeTier,
        label: METRIC.SWAP_FEES,
      });
      if (!swapFee?.amount) continue;

      const { token, amount } = swapFee;
      if (isGauged) {
        dailyRevenue.add(token, amount * PROTOCOL_SHARE, METRIC.PROTOCOL_REVENUE);
        dailyRevenue.add(token, amount * HOLDERS_SHARE, METRIC.HOLDERS_REVENUE);
        dailyProtocolRevenue.add(token, amount * PROTOCOL_SHARE, METRIC.PROTOCOL_REVENUE);
        dailyHoldersRevenue.add(token, amount * HOLDERS_SHARE, METRIC.HOLDERS_REVENUE);
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
  start: "2026-07-10",
  methodology,
  breakdownMethodology,
};

export default adapter;
