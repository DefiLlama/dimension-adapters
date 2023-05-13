import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

const URL = "https://api.hyperliquid.xyz/info";
const coins = {
  'ARB': 'coingecko:arbitrum',
  'DOGE': 'coingecko:dogecoin',
  'OP': 'coingecko:optimism',
  'DYDX': 'coingecko:dydx',
  'SOL': 'coingecko:solana',
  'LTC': 'coingecko:litecoin',
  'AVAX': 'coingecko:avalanche-2',
  'ETH': 'coingecko:ethereum',
  'ATOM': 'coingecko:cosmos',
  'BTC': 'coingecko:bitcoin',
  'MATIC': 'coingecko:matic-network',
  'APE': 'coingecko:apecoin',
  'BNB': 'coingecko:binancecoin',
}


interface IAPIResponse {
  volume: string;
  timestamp: number;
  id: string;
  volumeUSD: number;
  closePrice: string;
};

const getBody = (coin: string) => {
  return {"type":"candleSnapshot", "req": {"coin": coin, "interval": "1d", "startTime": 1677283200000}}
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historical = (await Promise.all(Object.keys(coins).map((coins: string) =>axios.post(URL, getBody(coins)))))
    .map((a: any, index: number) => a.data.map((e: any) => { return { timestamp: e.t / 1000, volume: e.v, closePrice: e.c, id: Object.values(coins)[index]}})).flat()

  const historicalUSD = historical.map((e: IAPIResponse) => {
    return {
      ...e,
      volumeUSD: Number(e.volume) * Number(e.closePrice)
    }
  });
  const dailyVolume = historicalUSD.filter((e: IAPIResponse) => e.timestamp === dayTimestamp)
    .reduce((a: number, {volumeUSD}) => a+volumeUSD, 0);
  const totalVolume = historicalUSD.filter((e: IAPIResponse) => e.timestamp <= dayTimestamp)
    .reduce((a: number, {volumeUSD}) => a+volumeUSD, 0);
  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1677283200,
    },
  }
};

export default adapter;
