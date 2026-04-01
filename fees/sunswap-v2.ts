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
        if (!res || !res.length) throw new Error(`No fee data returned for date range ${startStr} - ${endStr}`);
        const dayItem = res.find((item) => item.date === start);
        if (!dayItem) throw new Error(`No fee data for date ${startStr}`);
        const dailyFees = dayItem.fee;
        const dailySupplySideRevenue = dailyFees * 5 / 6;
        const dailyHoldersRevenue = dailyFees / 6;
        return { dailyFees, dailySupplySideRevenue, dailyProtocolRevenue: 0, dailyRevenue: dailyHoldersRevenue, dailyHoldersRevenue };
      }) as any,
      start: '2024-01-06'
    },
  },
  methodology: {
    Fees: 'A 0.3% fee is charged on each swap.',
    Revenue: '1/6 of all swap fees are used to buyback and burn SUN.',
    ProtocolRevenue: 'The protocol keeps no revenue.',
    SupplySideRevenue: '5/6 of all swap fees are distributed to liquidity providers.',
    HoldersRevenue: '1/6 of all swap fees are used to buyback and burn SUN.',
  },

}

export default adapter;
