import { Adapter, FetchOptions, SimpleAdapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const api = "https://openapi.sun.io/open/api/feeData"
interface IResponse {
  date: number;
  fee: number;
}

const adapterHistorical: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TRON]: {
      fetch: (async (_t: any, _a: any, options: FetchOptions) => {
        const start = options.startOfDay * 1000;
        const end = start + 86400;
        const startStr = new Date(start).toISOString().split("T")[0];
        const endStr = new Date(end).toISOString().split("T")[0];
        const url = `${api}?fromDate=${startStr}&toDate=${endStr}&version=v1`;
        const res: IResponse[] = (await httpGet(url)).data;
        const dailyFees = options.createBalances();
        const dayItem = res.find((item) => item.date === start);
        dailyFees.addGasToken((dayItem?.fee || 0) * 1e6);
        return { dailyFees, timestamp: options.startOfDay };
      }) as any,
      start: '2024-01-06'
    },
  },

}
async function fetch() {
  const { data: { list } } = await httpGet('https://abc.endjgfsv.link/swap/v2/exchanges/scan?pageNo=1&orderBy=volume24hrs&desc=true&pageSize=1000')
  let dailyFees = 0
  list.forEach((item: { volume24hrs: number; liquidity: number; tokenSymbol: string, fees24hrs: number }) => {
    if (!item.volume24hrs || +item.volume24hrs === 0) return;
    const volTvlRatio = +item.volume24hrs / +item.liquidity;
    if (volTvlRatio < 50 && +item.liquidity < 1e7) { // filter out scam volume
      dailyFees += +item.fees24hrs;
    } else {
      // console.log(`Volume: ${item.volume24hrs}, TVL: ${item.liquidity}, Ratio: ${volTvlRatio} symbol: ${item.tokenSymbol} - Skipping this exchange due to high ratio`);
    }
  });

  return { dailyFees }
}

const adapter: SimpleAdapter = {
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.TRON],
};

export default adapter;
