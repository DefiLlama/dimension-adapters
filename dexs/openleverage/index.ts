import { Chain } from "@defillama/sdk/build/general";
import { FetchResult, SimpleAdapter, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill, { IGraphs } from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

type TEndoint = {
  [chain: string | Chain]: string;
};

const endpoints: TEndoint = {
  [CHAIN.BSC]: "https://bnb.openleverage.finance/api/overview/statistical/stat",
  [CHAIN.KCC]: "https://kcc.openleverage.finance/api/overview/statistical/stat",
  [CHAIN.ETHEREUM]: "https://eth.openleverage.finance/api/overview/statistical/stat",
};

interface IVolumeall {
  date: string;
  volume: number;
}

const graphs = (chain: Chain) => {
  return async (timestamp: number, _chainBlocks: ChainBlocks): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historicalVolume: IVolumeall[] = (await fetchURL(endpoints[chain])).tradingChart;

    const totalVolume = historicalVolume
      .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
      .reduce((acc, { volume }) => acc + Number(volume), 0)
    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  }
};

const getStartTimestamp = async (chain: Chain) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(endpoints[chain])).tradingChart;
  return (new Date(historicalVolume[0].date).getTime()) / 1000;
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: async () => getStartTimestamp(chain),
        customBackfill: customBackfill(chain as Chain, graphs as unknown as IGraphs),
      }
    }
  }, {})
};

export default adapter;
