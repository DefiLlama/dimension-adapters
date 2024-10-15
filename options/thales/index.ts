import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { time } from "console";

interface IFee {
  timestamp: string;
  daily_fee: number;
  total_fee: number;
}

const getFeeQueryId = (chain: Chain): string => {
  switch (chain) {
    case CHAIN.ARBITRUM:
      return "4165344";
    case CHAIN.OPTIMISM:
      return "4165303";
    case CHAIN.BASE:
    default:
      return "4165350";
  }
};

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const fees: IFee[] = await queryDune(getFeeQueryId(chain))
    const dateString = new Date(options.endTimestamp * 1000).toISOString().split("T")[0];
    const daily = fees.find(({ timestamp })=> timestamp.split(' ')[0] === dateString);
    const dailyFees = daily?.daily_fee || 0;
    const totalFees = daily?.total_fee || 0;
    return {
      dailyFees,
      totalFees,
    };
  };
};

const adapter: Adapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1662463922,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1641838619,
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: 1691692525,
    },
  },
};
export default adapter;
