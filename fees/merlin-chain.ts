import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.MERLIN]: {
      fetch: async ({ createBalances, startOfDay }: FetchOptions) => {
        const dailyFees = createBalances();
        const endOfDay = startOfDay + 86400 - 1;
        const url = `https://scan.merlinchain.io/api/trpc/stat.getDailyTxFee?input=${encodeURIComponent(JSON.stringify({ json: { timeStart: startOfDay, timeEnd: endOfDay } }))}`;
        const res = await httpGet(url);
        if (!res?.result?.data?.json) throw new Error("Failed to fetch Merlin chain fees");
        const items = res.result.data.json;
        const dateStr = new Date(startOfDay * 1000).toISOString().slice(0, 10);
        const entry = items.find((item: any) => item.date.startsWith(dateStr));
        if (!entry) throw new Error(`No fee data for ${dateStr}`);
        dailyFees.addCGToken("bitcoin", entry.count);
        return { dailyFees, timestamp: startOfDay };
      },
      start: '2024-02-09',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total transactions fees paid by users, data sourced from MerlinChain explorer api.'
  }
};

export default adapter;
