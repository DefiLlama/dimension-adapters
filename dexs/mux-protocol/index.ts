import axios from "axios";
import type { BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";

const chains = [CHAIN.AVAX, CHAIN.BSC, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.FANTOM]

const normalizeChain = (c: string) => {
  if (c === "BNB Chain".toLowerCase()) return "bsc";
  if (c === "avalanche") return "avax";
  return c.toLowerCase()
}

interface IAPIResponse {
  data: {
    rows: [string, string, number][] //[dateString, chain ,volume]
  }
}
interface IVolumeall {
  date: string;
  amountUSD: number;
}

const url = "https://stats.mux.network/api/public/dashboard/13f401da-31b4-4d35-8529-bb62ca408de8/dashcard/389/card/306?parameters=%5B%5D";

type TStartTime = {
  [l: string]: number;
}
const startTime: TStartTime = {
  [CHAIN.ARBITRUM]: 1680393600,
  // [CHAIN.FANTOM]: 1680307200,
  [CHAIN.AVAX]: 1675555200,
  [CHAIN.OPTIMISM]: 1678147200,
  [CHAIN.BSC]: 1663459200,
}
const graph = (chain: Chain) => {
  return async (timestamp: number) => {
    const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const response = (await axios.get(url)).data as IAPIResponse
    const volumehistorical: IVolumeall[] =  response.data.rows
      .filter(([_,c]) => normalizeChain(c.toLowerCase()) == chain)
      .map(([date, _, ammountUSD]: [string, string, number]) => {
        return {
          date: date,
          amountUSD: ammountUSD
        } as IVolumeall
      })
    const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
    const dailyVolume =  volumehistorical.find((e: IVolumeall) => e.date.split("T")[0] === dateString)?.amountUSD;
    const totalVolume = volumehistorical
    .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= cleanTimestamp)
    .reduce((acc, { amountUSD }) => acc + Number(amountUSD), 0);
    return {
      timestamp: cleanTimestamp,
      dailyVolume: dailyVolume ? `${dailyVolume}`: undefined,
      totalVolume: dailyVolume? `${totalVolume}`: undefined
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: graph(chain),
        start: async () => startTime[chain],
      }
    }
  }, {} as BaseAdapter)
};

export default adapter;
