import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const api = "https://backend.memewe.club/trade/stats/fee";

const adapter: Adapter = {
  deadFrom: "2025-03-01",
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: (async (_t: any, _a: any, options: FetchOptions) => {
        const end = options.toTimestamp;
        const url = `${api}/${end}`;
        const fee = Number(await httpGet(url));
        const dailyFees = options.createBalances();
        dailyFees.addGasToken(fee || 0);
        return {
          dailyFees,
          dailyRevenue: dailyFees,
          timestamp: options.startOfDay,
        };
      }) as any,
      start: "2024-11-28",
    },
  },
};

export default adapter;
