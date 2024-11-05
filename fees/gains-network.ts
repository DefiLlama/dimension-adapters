import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

interface IStats {
  unix_ts: number;
  day: string;
  blockchain: string;
  daily_volume: number;

  // Fees
  project_fund: number;
  dev_fund: number; // deprecated; only used for older entries
  referral: number;
  nft_bots: number;
  all_fees: number;
  borrowing_fee: number;
  rollover_fee: number;
  cumul_fees: number; // all time chain fees

  // gTokens
  dai_stakers: number;
  usdc_stakers: number;
  weth_stakers: number;

  // GNS staking
  gns_stakers: number;
}
const requests: any = {};

export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const key = `${url}-${start}`;
  if (!requests[key])
    requests[key] = queryDune("4192496", {
      start: start,
      end: end,
    });
  return requests[key];
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const stats: IStats[] = await fetchURLWithRetry("4192496", options);
  const chainStat = stats.find((stat) => stat.unix_ts === options.startOfDay && stat.blockchain === options.chain);
  const [dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue, totalFees] = chainStat
    ? [
        chainStat.all_fees,
        chainStat.dev_fund + chainStat.project_fund + chainStat.gns_stakers,
        chainStat.gns_stakers,
        chainStat.dai_stakers + chainStat.usdc_stakers + chainStat.weth_stakers,
        chainStat.cumul_fees,
      ]
    : [0, 0, 0, 0, 0];

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    totalFees,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2022-06-03',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2022-12-30',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2024-09-26',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
