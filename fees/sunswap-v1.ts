import { Adapter, FetchOptions, SimpleAdapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const api = "https://openapi.sun.io/open/api/feeData"
interface IResponse {
  date: number;
  fee: number;
}

const SWAP_FEES = 'Swap Fees';
const SWAP_FEES_TO_LPS = 'Swap Fees To LPs';

const adapterHistorical: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (options: FetchOptions) => {
        const start = options.startOfDay * 1000;
        const end = start + 86400;
        const startStr = new Date(start).toISOString().split("T")[0];
        const endStr = new Date(end).toISOString().split("T")[0];
        const url = `${api}?fromDate=${startStr}&toDate=${endStr}&version=v1`;
        const res: IResponse[] = (await httpGet(url)).data;
        if (!Array.isArray(res) || !res.length)
          throw new Error(`sunswap-v1: no fee data returned for ${startStr}`);
        const dailyFees = options.createBalances();
        const dayItem = res.find((item) => item.date === start);
        if (!dayItem)
          throw new Error(`sunswap-v1: no fee data for ${startStr}`);
        dailyFees.addUSDValue(dayItem.fee, SWAP_FEES);
        return { dailyFees };
      }) as any,
      start: '2024-01-06'
    },
  },

}

async function fetch(options: FetchOptions) {
  const { data: { list } } = await httpGet('https://abc.endjgfsv.link/swap/v2/exchanges/scan?pageNo=1&orderBy=volume24hrs&desc=true&pageSize=1000')

  let feesUsd = 0
  for (const item of list) {
    if (!item.volume24hrs || +item.volume24hrs === 0) continue;
    const volTvlRatio = +item.volume24hrs / +item.liquidity;
    if (volTvlRatio < 50 && +item.liquidity < 1e7) {
      feesUsd += +item.fees24hrs;
    }
  }

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  dailyFees.addUSDValue(feesUsd, SWAP_FEES)
  dailySupplySideRevenue.addUSDValue(feesUsd, SWAP_FEES_TO_LPS)

  return { dailyFees, dailySupplySideRevenue, dailyRevenue: 0 }
}

const adapter: SimpleAdapter = {
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.TRON],
  methodology: {
    Fees: 'Swap fees paid by users.',
    Revenue: 'The protocol keeps no revenue.',
    SupplySideRevenue: 'All the swap fees are distributed to liquidity providers.',
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: 'Swap fees paid by users on SunSwap V1 pools.',
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_LPS]: 'All swap fees are distributed to liquidity providers.',
    },
  },
};

export default adapter;
