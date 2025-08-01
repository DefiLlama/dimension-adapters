import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

interface PerpInfo {
  volume: {
    '24h': number,
    '7d': number,
    '30d': number,
  },
  openInterest: {
    long: number,
    short: number,
    all: number,
  }
}

const fetch = async (timestamp: number): Promise<FetchResultVolume & FetchResultFees> => {
  const info: PerpInfo = (await fetchURL('https://api-perps-v1.raydium.io/main/info')).data

  return {
    dailyVolume: info.volume["24h"],
    shortOpenInterestAtEnd: info.openInterest.short,
    longOpenInterestAtEnd: info.openInterest.long,
    openInterestAtEnd: info.openInterest.all,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch,
      runAtCurrTime: true,
      start: '2024-01-01',
    },
  },
};

export default adapter;

