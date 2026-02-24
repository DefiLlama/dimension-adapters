import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { FetchResult, SimpleAdapter, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const poolsDataEndpoint = (chain: string) => `https://data.unifi.report/api/total-volume-liquidity/?blockchain=${chain}&page_size=1000`;

type TChains = {
  [chain: string | Chain]: string;
}
const chains: TChains = {
  [CHAIN.AVAX]: "Avalanche",
  [CHAIN.BITTORRENT]: "BitTorrent",
  [CHAIN.TRON]: "Tron",
  [CHAIN.ONTOLOGY_EVM]: "Ontology",
  [CHAIN.HARMONY]: "Harmony",
  [CHAIN.BSC]: "Binance",
  [CHAIN.ETHEREUM]: "Ethereum",
  [CHAIN.ICON]: "Icon",
  [CHAIN.IOTEX]: "IoTeX",
  [CHAIN.POLYGON]: "Polygon",
  // [CHAIN.FANTOM]: "Fantom"
};

interface IVolumeall {
  chain: string;
  volume: string;
  datetime: string;
}

const graphs = (chain: Chain) => {
  return async (timestamp: number, _chainBlocks: ChainBlocks): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    if(dayTimestamp > 1687478400) return {}
    const historicalVolume: IVolumeall[] = (await fetchURL(poolsDataEndpoint(chains[chain]))).results;

    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.datetime).getTime() / 1000) === dayTimestamp)?.volume

    return {
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  }
};

const adapter: SimpleAdapter = {
  deadFrom: "2023-06-23",
  adapter: Object.keys(chains).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
      }
    }
  }, {})
};

export default adapter;
