import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.prod.rabbitx.io/markets"
const candles = (market: string, timestampFrom: number, timestampTo: number) => 
    `https://api.prod.rabbitx.io/candles?market_id=${market}&timestamp_from=${timestampFrom}&timestamp_to=${timestampTo}&period=60`;

interface IVolumeall {
  volume: string;
  time: string;
  close: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = Math.floor(getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)) / 1000)
  const fromTimestamp = dayTimestamp - 60 * 60 * 24;  // 24 hours back
  const toTimestamp = dayTimestamp;

  // Get market data
  const response = await fetchURL(historicalVolumeEndpoint);
  const marketsData = response.data.result;
  
  // Fetch candles for each USD market  
  const historical: IVolumeall[] = (await Promise.all(marketsData.map((market: any) => fetchURL(candles(market.id, fromTimestamp, toTimestamp)))))
    .map((e: any) => e.data.result)
    .flat();

  // Calculate daily volume
  const dailyVolume = historical.filter((e: IVolumeall) => Number(e.time) < dayTimestamp)
    .reduce((a: number, b: IVolumeall) => a + Number(b.volume), 0)

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: async () => 1700179200000, // Replace with actual start timestamp
    },
  },
};

export default adapter;