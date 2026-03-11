import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const apiEVM = "https://api-evm.orderly.org/md/volume/daily_stats";

type DailyStats = {
  volume: string;
  date: string;
  netFee: number;
  dateString: string;
  createdAt: string;
  updatedAt: string;
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2023-10-26',
      fetch: async (__t: number, _: any, { startOfDay }: FetchOptions) => {
        const t = getUniqStartOfTodayTimestamp(new Date(startOfDay * 1000));
        const data: DailyStats[] = await fetchURL(apiEVM);
        return {
          timestamp: t,
          dailyFees: data.find(
            ({ createdAt }) => new Date(createdAt).valueOf() / 1_000 === t
          )?.netFee,
        };
      },
    },
  },
};

export default adapter;
