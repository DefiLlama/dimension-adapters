import axios from "axios";
import type { BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.MANTLE,
];

const NATIVE_ANALYTICS_ENDPOINT =
  "http://chain-monitoring.native.org/analytics/overview";

interface ResEntry {
  date: number;
  volumeUSD: number;
  transactionCounts: number;
  tvlUSD: number;
}


const getStartTime = async (chain: string) => {
  const response = await axios.get(
    `${NATIVE_ANALYTICS_ENDPOINT}?chain=${chain === CHAIN.AVAX ? "avalanche" : chain}`
  );

  const smallestDate = response.data.reduce(
    (minDate: number, current: ResEntry) => {
      return current.date < minDate ? current.date : minDate;
    },
    Number.POSITIVE_INFINITY
  );

  return smallestDate;
};

const adapter: SimpleAdapter = {
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (timestamp) => {
          const cleanTimestamp = getUniqStartOfTodayTimestamp(
            new Date(timestamp * 1000)
          );

          const response = await axios.get(
            `${NATIVE_ANALYTICS_ENDPOINT}?chain=${chain === CHAIN.AVAX ? "avalanche" : chain}`
          );

          const totalVol = response.data.reduce(
            (sum: number, entry: ResEntry) => sum + entry.volumeUSD,
            0
          );

          const dateEntry = response.data.find(
            (entry: ResEntry) => entry.date === cleanTimestamp
          );
          const dailyVol = dateEntry ? dateEntry.volumeUSD : undefined;

          return {
            timestamp: cleanTimestamp,
            dailyVolume: dailyVol,
            totalVolume: totalVol,
          };
        },
        start: async () => getStartTime(chain),
      },
    };
  }, {} as BaseAdapter),
};

export default adapter;
