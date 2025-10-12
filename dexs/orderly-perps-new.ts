import type { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const apiEVM = "https://api-evm.orderly.org/md/volume/daily_stats";

type DailyStats = {
  volume: string;
  date: string;
  netFee: number;
  dateString: string;
  createdAt: string;
  updatedAt: string;
};
let data: any

const adapter: Adapter = {
  adapter: {
    [CHAIN.ORDERLY]: {
      start: '2023-10-26',
      fetch: async (__t: number, _: any, { dateString }: FetchOptions) => {
        if (!data) data = httpGet(apiEVM)
        const res: DailyStats[] = await data

        const record = res.find(i => i.date.slice(0, 10) === dateString)
        if (!record) throw new Error('Data not found')
        return { dailyFees: record.netFee, dailyVolume: record.volume }
      },
    },
  },
};

export default adapter;
