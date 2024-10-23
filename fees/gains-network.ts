import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

interface IStats {
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

const fetch = async (timestamp: number, _: ChainBlocks, { chain }: FetchOptions): Promise<FetchResultFees> => {
  const stats: IStats[] = await queryDune("4192058"); // dune.gains.result_g_trade_stats_defillama

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(dayTimestamp * 1000).toISOString().split("T")[0];

  const chainStat = stats.find((stat) => stat.day.split(" ")[0] === dateString && stat.blockchain === chain);
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
    totalFees,
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
};

export default adapter;
