// source for fees: https://www.paradex.trade/stats
import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
const marketsEndpoint = "https://api.prod.paradex.trade/v1/markets"
const feesEndpoint = "https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/5913/card/5760?parameters=%5B%5D"

interface IVolumeall {
  volume_24h: string;
  total_volume: string;
}

interface IFeesData {
  data: {
    rows: [string, number][];
  }
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const end = timestamp
  //need to calculate start time of timestamp - 24h
  const start = end - (60 * 60 * 24)
  const markets: string[] = ((await fetchURL(marketsEndpoint)).results).map((m: any) => m.symbol);
  const historical: IVolumeall[] = (await Promise.all(markets.map((market: string) => fetchURL(historicalVolumeEndpoint(market, start*1000, end*1000))))).map((e: any) => e.results.slice(-1)).flat()

  const dailyVol = historical.reduce((a: number, b: IVolumeall) => a+Number(b.volume_24h), 0)

  const totalVol = historical.reduce((a: number, b: IVolumeall) => a+Number(b.total_volume), 0)

  // Fetch fees data
  const feesData = await fetchURL(feesEndpoint) as IFeesData
  const timestampStr = new Date(timestamp * 1000).toISOString().split('T')[0] + "T00:00:00Z"
  const dailyFees = feesData.data.rows.find(row => row[0] === timestampStr)?.[1] || 0

  return { 
    timestamp, 
    dailyVolume: dailyVol? `${dailyVol}`: undefined, 
    totalVolume: totalVol? `${totalVol}`: undefined,
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    dailyUserFees: dailyFees ? `${dailyFees}` : undefined
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-09-01',
    },
  },
};

export default adapter; 
