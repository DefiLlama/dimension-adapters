import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEth = (dateTime: string) => `https://api.extended.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`
const historicalVolumeStarknet = (dateTime: string) => `https://api.starknet.extended.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`

interface IVolumeall {
  tradingVolume: string;
  totalTradingVolume: string;
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
  }
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultVolume> => {
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
  const openInterestAtEnd = res.reduce((a: number, b: any) => a + Number(b.marketStats.openInterest || 0), 0)

  return {
    dailyVolume,
    openInterestAtEnd
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig
};

export default adapter; 
