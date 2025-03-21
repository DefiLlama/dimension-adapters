import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (dateTime: string) => `https://api.prod.x10.exchange/api/v1/exchange/stats/trading?fromDate=${dateTime}&toDate=${dateTime}`

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

  const dailyVol = historical.data.reduce((a: number, b: IVolumeall) => a+Number(b.tradingVolume), 0)
  const totalVol = historical.data.reduce((a: number, b: IVolumeall) => a+Number(b.totalTradingVolume), 0)

    return { 
        timestamp, 
        dailyVolume: dailyVol? `${dailyVol}`: undefined, 
        totalVolume: totalVol? `${totalVol}`: undefined
    };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-03-11',
    },
  },
};

export default adapter; 
