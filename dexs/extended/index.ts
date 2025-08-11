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

const chainConfig = {
  [CHAIN.ETHEREUM]: {
    start: '2025-03-11',
    endpoints: {
      historicalVolume: historicalVolumeEth,
      markets: 'https://api.extended.exchange/api/v1/info/markets',
    },
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
  const timestampISO = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const historical: IResponse = await fetchURL(chainConfig[options.chain].endpoints.historicalVolume(timestampISO))
  const dailyVolume = historical.data.reduce((a: number, b: IVolumeall) => a + Number(b.tradingVolume), 0)
  const res = (await fetchURL(chainConfig[options.chain].endpoints.markets)).data
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
