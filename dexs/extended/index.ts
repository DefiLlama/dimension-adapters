import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEth = (dateTime: string) => `https://api.extended.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`
const historicalVolumeStarknet = (dateTime: string) => `https://api.starknet.extended.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`
const historicalVolumeArc = (dateTime: string) => `https://api.starknet.extended.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`

interface IVolumeall {
  tradingVolume: string;
  totalTradingVolume: string;
  fees: string;
}

interface IResponse {
  data: IVolumeall[];
}

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    start: '2025-03-11',
    endpoints: {
      historicalVolume: historicalVolumeEth,
      markets: 'https://api.extended.exchange/api/v1/info/markets',
    },
    deadFrom: 1766966400 //2025-12-29
  },
  [CHAIN.STARKNET]: {
    start: '2025-08-10',
    endpoints: {
      historicalVolume: historicalVolumeStarknet,
      markets: 'https://api.starknet.extended.exchange/api/v1/info/markets',
    },
    deadFrom: 1792627200 //2026-10-22
  },
  [CHAIN.ARC]: {
    start: '2026-10-22',
    endpoints: {
      historicalVolume: historicalVolumeArc,
      markets: 'https://api.starknet.extended.exchange/api/v1/info/markets',
    },
  }
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const config = chainConfig[options.chain];

  if (config.deadFrom && config.deadFrom <= options.startOfDay)
    return {
      dailyVolume: 0,
      openInterestAtEnd: 0,
    }

  const timestampISO = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const historical: IResponse = await fetchURL(config.endpoints.historicalVolume(timestampISO))
  const dailyVolume = historical.data.reduce((a: number, b: IVolumeall) => a + Number(b.tradingVolume), 0) / 2
  const res = (await fetchURL(config.endpoints.markets)).data
  // marketStats.openInterest sums long and short, halve it like tradingVolume above
  const openInterestAtEnd = res.reduce((a: number, b: any) => a + Number(b.marketStats.openInterest || 0), 0) / 2

  if (options.chain !== CHAIN.ARC)
    return { dailyVolume, openInterestAtEnd }

  const dailyFees = historical.data.reduce((a: number, b: IVolumeall) => {
    if (b.fees === undefined) throw new Error('Extended stats response is missing fees')
    return a + Number(b.fees)
  }, 0)

  return {
    dailyVolume,
    openInterestAtEnd,
    dailyFees,
  };
};

const methodology = {
  Fees: "Trading fees paid by maker and taker on every fill.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter; 
