import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const api = "https://openapi.sun.io/open/api/feeData"
// Daily protocol revenue (USD) of SunSwap V3, same response format as feeData.
const revenueApi = "https://openapi.sun.io/open/api/revenueData"
// The protocol fee (1/6 of the swap fee) was turned on for the WTRX/USDT pool TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx
// on 2026-05-02 09:31:57 UTC: https://tronscan.org/#/transaction/be346d97b780a1c016df2df8d5b594b2ca6bf41b98fac41a4d634bd69cd23976
// Revenue is 0 before that day.
const protocolFeeStart = Date.parse('2026-05-02T00:00:00Z')
interface IResponse {
  date: number;
  fee:  number;
}

const SWAP_FEES = 'Swap Fees';
const SWAP_FEES_TO_LPS = 'Swap Fees To LPs';
const SWAP_FEES_TO_PROTOCOL = 'Swap Fees To Protocol';

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (options: FetchOptions) => {
        const start = options.startOfDay * 1000;
        const end = start + 86400;
        const startStr = new Date(start).toISOString().split("T")[0];
        const endStr = new Date(end).toISOString().split("T")[0];
        const url = `${api}?fromDate=${startStr}&toDate=${endStr}&version=v3`;
        const res: IResponse[] = (await httpGet(url)).data;
        if (!res || !res.length) throw new Error(`No fee data returned for date range ${startStr} - ${endStr}`);
        const dayItem = res.find((item) => item.date === start);
        if (!dayItem) throw new Error(`No fee data for date ${startStr}`);
        const dailyFees = dayItem.fee;

        let protocolFees = 0;
        if (start >= protocolFeeStart) {
          const revenueRes: IResponse[] = (await httpGet(`${revenueApi}?fromDate=${startStr}&toDate=${endStr}&version=v3`)).data;
          const revenueItem = Array.isArray(revenueRes) ? revenueRes.find((item) => item.date === start) : undefined;
          if (!revenueItem) throw new Error(`No revenue data for date ${startStr}`);
          if (typeof revenueItem.fee !== "number" && typeof revenueItem.fee !== "string") throw new Error(`Invalid revenue data for date ${startStr}`);
          protocolFees = Number(revenueItem.fee);
        }

        const fees = options.createBalances();
        const revenue = options.createBalances();
        const supplySideRevenue = options.createBalances();
        fees.addUSDValue(dailyFees, SWAP_FEES);
        revenue.addUSDValue(protocolFees, SWAP_FEES_TO_PROTOCOL);
        supplySideRevenue.addUSDValue(dailyFees - protocolFees, SWAP_FEES_TO_LPS);
        return { dailyFees: fees, dailySupplySideRevenue: supplySideRevenue, dailyRevenue: revenue };
      }) as any,
      start: '2024-01-06'
    },
  },
  methodology: {
    Fees: 'Swap fees paid by users.',
    Revenue: 'Protocol share of swap fees: 1/6 of the swap fee on the WTRX/USDT pool since 2026-05-02.',
    SupplySideRevenue: 'Swap fees distributed to liquidity providers, after the protocol share.',
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: 'Swap fees paid by users on all SunSwap V3 pools.',
    },
    Revenue: {
      [SWAP_FEES_TO_PROTOCOL]: '1/6 of the swap fee on the WTRX/USDT pool since 2026-05-02.',
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_LPS]: 'Swap fees minus the protocol share.',
    },
  },
}

export default adapter;
