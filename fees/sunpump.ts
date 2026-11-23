import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

const api = "https://openapi.sunpump.meme/pump-api/api/feeData"
interface IResponse {
  date: number;
  count: number;
  amount: number;
}

const TRADING_FEES_TO_PROTOCOL = 'Trading Fees To Protocol';

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (options: FetchOptions) => {
        const start = options.startOfDay * 1000;
        const end = start + 86400;
        const startStr = new Date(start).toISOString().split("T")[0];
        const endStr = new Date(end).toISOString().split("T")[0];
        const url = `${api}?fromDate=${startStr}&toDate=${endStr}`;
        const res: IResponse[] = (await httpGet(url)).data;
        const dailyFees = options.createBalances();
        const dayItem = res.find((item) => item.date === start);
        dailyFees.addGasToken((dayItem?.amount || 0) * 1e6, METRIC.TRADING_FEES);
        return { dailyFees, dailyRevenue: dailyFees.clone(1, TRADING_FEES_TO_PROTOCOL) };
      }) as any,
      start: '2024-08-11',
    },
  },
  methodology: {
    Fees: 'Total trading fees paid by users',
    Revenue: 'Total trading fees paid by users collected by SunPump',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Trading fees paid by users on SunPump token trades.',
    },
    Revenue: {
      [TRADING_FEES_TO_PROTOCOL]: 'All trading fees are collected by SunPump.',
    },
  },
}

export default adapter;
