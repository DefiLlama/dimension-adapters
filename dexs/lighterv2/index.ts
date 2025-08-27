import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

var lighterV2VolumeEndpoint =
  "https://api.lighter.xyz/v2/volume?blockchain_id=42161";

interface IVolumeall {
  totalVolume: number;
  dailyVolume: number;
}

const marketurl = "https://api.lighter.xyz/v2/order_book_metas?blockchain_id=42161";
interface IMarket {
  id: string;
  symbol: string;
}

interface ICandlesticks {
  volume0: number;
  volume1: number;
  close: number;
  timestamp: number;
}

const url = (symbol: string, end:  number) => `https://api.lighter.xyz/v2/candlesticks?blockchain_id=42161&order_book_symbol=${symbol}&resolution=1d&start_timestamp=1697144400&end_timestamp=${end}&count_back=100`
const fetchV2 = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  lighterV2VolumeEndpoint = lighterV2VolumeEndpoint.concat(
    `&timestamp=${dayTimestamp}`
  );

  const markets = (await fetchURL(marketurl)) as IMarket[]
  const res = (await Promise.all(markets.map(async ({ symbol }) => fetchURL(url(symbol, dayTimestamp + 86400)))))
    .map((res) => res)
    .map((res) => res.candlesticks).flat() as ICandlesticks[]
  const dailyVolume = res.filter(e => e.timestamp === dayTimestamp)
    .reduce((acc, { volume0, close }) => acc + (volume0) * close, 0)

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchV2,
      start: '2023-10-12',
    },
  },
};

export default adapter;
