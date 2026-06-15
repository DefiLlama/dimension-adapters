import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";
import { filterPools } from "../helpers/uniswap";

const REVENUE_LABEL = 'Swap Fees To Protocol';

// PancakeSwap V3 fork on Base
const factory = '0xb5620F90e803C7F957A9EF351B8DB3C746021BEa';
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)';

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // 13768675 = factory's first PoolCreated block (2024-04-28)
  const poolLogs = await getLogs({ target: factory, eventAbi: poolCreatedEvent, fromBlock: 13768675, cacheInCloud: true });
  const pairObject: Record<string, string[]> = {};
  const fees: Record<string, number> = {};
  poolLogs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1];
    fees[log.pool] = Number(log.fee) / 1e6;
  });

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue };

  const pairs = Object.keys(filteredPairs);
  const allLogs = await getLogs({ targets: pairs, eventAbi: swapEvent, flatten: false });
  allLogs.forEach((logs: any, index: number) => {
    if (!logs.length) return;
    const pair = pairs[index];
    const [token0, token1] = pairObject[pair];
    const feeTier = fees[pair];
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
      const { token, amount } = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * feeTier, amount1: Number(log.amount1) * feeTier, label: METRIC.SWAP_FEES });

      // protocolFeesToken0/1 are the protocol's exact cut of this swap's fee, charged on the
      // input token; protocol share varies per pool (slot0.feeProtocol: 25%-34%), so derive it
      // per swap instead of hardcoding a ratio
      const amount0 = Math.abs(Number(log.amount0));
      const amount1 = Math.abs(Number(log.amount1));
      const protocolFee0 = Number(log.protocolFeesToken0);
      const protocolFee1 = Number(log.protocolFeesToken1);
      let protocolShare = 0;
      if (protocolFee0 > 0 && amount0 > 0) protocolShare = protocolFee0 / (amount0 * feeTier);
      else if (protocolFee1 > 0 && amount1 > 0) protocolShare = protocolFee1 / (amount1 * feeTier);
      if (!isFinite(protocolShare) || protocolShare < 0) protocolShare = 0;
      if (protocolShare > 1) protocolShare = 1;

      dailyRevenue.add(token, amount * protocolShare, REVENUE_LABEL);
      dailySupplySideRevenue.add(token, amount * (1 - protocolShare), METRIC.LP_FEES);
    });
  });

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Swap volume across all SwapBased V3 (PancakeSwap V3 fork) pools on Base.",
    Fees: "Trading fees paid by swappers, equal to each pool's fee tier.",
    UserFees: "Same as Fees - all trading fees are paid by swappers.",
    Revenue: "Protocol's share of trading fees (25%-34% per pool, read from each swap's emitted protocolFeesToken0/1). Docs state protocol revenue is shared with xBASE stakers, but no treasury/staker split is published.",
    SupplySideRevenue: "Remaining share of trading fees (66%-75% per pool) distributed to liquidity providers.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: "Trading fees paid by swappers, equal to each pool's fee tier." },
    UserFees: { [METRIC.SWAP_FEES]: "Trading fees paid by swappers, equal to each pool's fee tier." },
    Revenue: { [REVENUE_LABEL]: "Protocol's share of trading fees (25%-34% per pool, from each swap's protocolFeesToken0/1)." },
    SupplySideRevenue: { [METRIC.LP_FEES]: "Liquidity providers' share of trading fees (66%-75% per pool)." },
  },
  fetch,
  chains: [CHAIN.BASE],
  start: '2024-04-28',
};

export default adapter;
