import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

//const historicalVolumeEndpoint = "https://api.swapline.com/api/v1/protocol-chartdata?aggregate=true"
const historicalVolumeEndpoint = "https://api.swapline.com/api/v1/protocol-chartdata?chainId=";

interface IVolumeall {
  volumeUSD: number;
  date: number;
}

const graph = (_chain: number) => {
	return async (timestamp: number) => {
  		const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  		const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint+_chain))?.data[0]?.chainEntries;
  		const totalVolume = historicalVolume
    		.filter(volItem => volItem.date <= dayTimestamp)
    		.reduce((acc, { volumeUSD }) => acc + Number(volumeUSD), 0)

  		const dailyVolume = historicalVolume
    		.find(dayItem =>  dayItem.date  === dayTimestamp)?.volumeUSD

  		return {
    		totalVolume: `${totalVolume}`,
    		dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    		timestamp: dayTimestamp,
  		}
	}
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: graph(250),
      start: async () => 1680048000,
    },
    [CHAIN.OPTIMISM]: {
      fetch: graph(10),
      start: async () => 1680048000,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(42161),
      start: async () => 1680048000,
    },
    [CHAIN.SHIMMER_EVM]: {
      fetch: graph(148),
      start: async () => 1680048000,
    },
  },
};

export default adapter;
