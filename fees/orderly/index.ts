import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
      fetch: async ({ startOfDay }: FetchOptions) => {
        const data: DailyStats[] = await fetchURL(apiEVM);
        return {
          dailyFees: data.find(
            ({ createdAt }) => new Date(createdAt).valueOf() / 1_000 === startOfDay
          )?.netFee,
        };
      },
    },
  },
};

export default adapter;
