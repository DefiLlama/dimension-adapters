import { time } from "console";
import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const api = "https://openapi.sun.io/open/api/feeData"
interface IResponse {
  date: number;
  fee:  number;
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (_t: any, _a: any ,options: FetchOptions) => {
        const start = options.startOfDay * 1000;
        const end = start + 86400;
        const startStr = new Date(start).toISOString().split("T")[0];
        const endStr = new Date(end).toISOString().split("T")[0];
        const url = `${api}?fromDate=${startStr}&toDate=${endStr}&version=v2`;
        const res: IResponse[] = (await httpGet(url)).data;
        const dayItem = res.find((item) => item.date === start);
        const dailyFees = dayItem?.fee || 0;
        return { dailyFees, timestamp: options.startOfDay };
      }) as any,
      start: '2024-01-06'
    },
  },

}

export default adapter;
