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

  // gTokens
  dai_stakers: number;
  usdc_stakers: number;
  weth_stakers: number;

  // GNS staking
  gns_stakers: number;
}
const requests: any = {}

export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const key = `${url}-${start}`;
  if (!requests[key])
    requests[key] = queryDune("4192496", {
      start: start,
      end: end,
    })
  return requests[key]
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
        chainStat.all_fees + chainStat.rollover_fee + chainStat.borrowing_fee,
      ]
    : [0, 0, 0, 0, 0];

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    // totalFees, // seem to be wrong
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: 1654214400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 1672358400,
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: 1727351131,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
