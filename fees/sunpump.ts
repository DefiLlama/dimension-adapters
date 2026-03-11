import { time } from "console";
import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const api = "https://openapi.sunpump.meme/pump-api/api/feeData"
interface IResponse {
  date: number;
  count: number;
  amount: number;
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (_t: any, _a: any, options: FetchOptions) => {
        const start = options.startOfDay * 1000;
        const end = start + 86400;
        const startStr = new Date(start).toISOString().split("T")[0];
        const endStr = new Date(end).toISOString().split("T")[0];
        const url = `${api}?fromDate=${startStr}&toDate=${endStr}`;
        const res: IResponse[] = (await httpGet(url)).data;
        const dailyFees = options.createBalances();
        const dayItem = res.find((item) => item.date === start);
        dailyFees.addGasToken((dayItem?.amount || 0) * 1e6);
        return { dailyFees, dailyRevenue: dailyFees, timestamp: options.startOfDay };
      }) as any,
      start: '2024-08-11',
    },
  },
  methodology: {
    Fees: 'Total trading fees paid by users',
    Revenue: 'Total trading fees paid by users collected by SunPump',
  }

}

export default adapter;
