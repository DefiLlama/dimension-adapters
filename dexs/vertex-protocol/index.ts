import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

interface IVolumeall {
  timestamp: string;
  volume: string;
  close_x18: string;
}

const url = 'https://prod.vertexprotocol-backend.com/indexer';
const fetch = async (timestamp: number) => {
  const toTimestamp = timestamp
  const fromTimestamp = timestamp - 60 * 60 * 24
  const  GRANULARITY = 300;
  const LIMIT = 86400 / GRANULARITY;
  const product_ids = [1,3];
  const historicalVolume: IVolumeall[]  = (await Promise.all(product_ids.map((product_id: number) => axios.post(url, {
    "candlesticks": {
      "product_id": product_id,
      "granularity": GRANULARITY,
      "limit": LIMIT,
      "max_time": toTimestamp
    },
  }, {
    headers: {
      "Content-Type": "application/json",
      "user-agent": "insomnia/2022.5.0"
    }
  })))).map((e: any) => e.data.candlesticks).flat();
  const volume = historicalVolume.filter((e: IVolumeall) => Number(e.timestamp) >= fromTimestamp)
    .reduce((acc: number, b: IVolumeall) => acc + (Number(b.volume) * (Number(b.close_x18)) / 10 ** 18), 0)
  const dailyVolume = volume / 10 ** 18;
  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: timestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: async () => 1683504009
    },
  },
};

export default adapter;
