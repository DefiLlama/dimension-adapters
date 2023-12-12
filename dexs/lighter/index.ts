import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

var lighterVolumeEndpoint =
  "https://api.lighter.xyz/volume?blockchain_id=42161";

interface IVolumeall {
  totalVolume: number;
  dailyVolume: number;
}

const symbol = [
  "WETH-USDC",
  "USDC-USDC",
  "USDT-USDC",
]
const url = (symbol: string, end:  number) => ` https://api.lighter.xyz/candlesticks?blockchain_id=42161&order_book_symbol=${symbol}&resolution=1d&start_timestamp=1697144400&end_timestamp=${end}&count_back=100`
interface IVolumeall {
  totalVolume: number;
  dailyVolume: number;
}

interface ICandlesticks {
  volume0: number;
  volume1: number;
  close: number;
  timestamp: number;
}



const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  lighterVolumeEndpoint = lighterVolumeEndpoint.concat(
    `&timestamp=${dayTimestamp}`
  );
  const res = (await Promise.all(symbol.map(async (symbol) => fetchURL(url(symbol, dayTimestamp + 86400)))))
    .map((res) => res.data)
    .map((res) => res.candlesticks).flat() as ICandlesticks[]

  const dailyVolume = res
    .filter(e => e.timestamp === dayTimestamp)
    .reduce((acc, { volume0, close }) => acc + (volume0) * close, 0)

  const result: IVolumeall = (await fetchURL(lighterVolumeEndpoint)).data;

  return {
    dailyVolume: result ? `${dailyVolume}` : undefined,
    totalVolume: result ? `${result.totalVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1677934513,
    },
  },
};
export default adapter;
