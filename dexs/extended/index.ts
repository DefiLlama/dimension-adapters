import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (dateTime: string) => `https://api.prod.x10.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`
const marketsEndpoint = 'https://app.extended.exchange/api/v1/info/markets'

interface IVolumeall {
  tradingVolume: string;
  totalTradingVolume: string;
}

interface IResponse {
  data: IVolumeall[];
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const timestampISO = new Date(dayTimestamp * 1000).toISOString().split('T')[0];
  const historical: IResponse= await fetchURL(historicalVolumeEndpoint(timestampISO))
  const dailyVolume = historical.data.reduce((a: number, b: IVolumeall) => a+Number(b.tradingVolume), 0)
  const res = (await fetchURL(marketsEndpoint)).data
  const openInterestAtEnd = res.reduce((a: number, b: any) => a+Number(b.marketStats.openInterest || 0), 0)

  return { 
      dailyVolume, 
      openInterestAtEnd
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      runAtCurrTime: true,
      start: '2025-03-11',
    },
  },
};

export default adapter; 
