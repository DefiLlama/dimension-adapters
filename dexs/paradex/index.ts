import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
const marketsEndpoint = "https://api.prod.paradex.trade/v1/markets"

interface IVolumeall {
  volume_24h: string;
  total_volume: string;
}


const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const end = timestamp
  //need to calculate start time of timestamp - 24h
  const start = end - (60 * 60 * 24)
  const markets: string[] = ((await fetchURL(marketsEndpoint)).results).map((m: any) => m.symbol);
  const historical: IVolumeall[] = (await Promise.all(markets.map((market: string) => fetchURL(historicalVolumeEndpoint(market, start*1000, end*1000))))).map((e: any) => e.results.slice(-1)).flat()

  const dailyVol = historical.reduce((a: number, b: IVolumeall) => a+Number(b.volume_24h), 0)

  const totalVol = historical.reduce((a: number, b: IVolumeall) => a+Number(b.total_volume), 0)

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
      start: 1693526400,
    },
  },
};

export default adapter; 
