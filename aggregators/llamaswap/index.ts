import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = "https://api.llama.fi/";
const startTimestamp = 1675209600; // 04.01.2023
const chains = [
  "ethereum",
  "bsc",
  "polygon",
  "optimism",
  "arbitrum",
  "avax",
  "gnosis",
  "fantom",
  "klaytn",
  "aurora",
  "celo",
  "cronos",
  "dogechain",
  "moonriver",
  "bttc",
  "oasis",
  "velas",
  "heco",
  "harmony",
  "boba",
  "okexchain",
  "fuse",
  "moonbeam",
  "canto",
  "zksync",
  "polygonzkevm",
  "ontology",
  "kava",
  "pulse",
  "metis",
  "base",
];

const fetch =
  (chain: string) =>
    async (timestamp: number): Promise<FetchResult> => {
      const dayTimestamp = timestamp;

      const dailyVolume = await fetchURL(
        `${URL}getSwapDailyVolume/?timestamp=${dayTimestamp}&chain=${chain}`
      );
      const totalVolume = await fetchURL(
        `${URL}getSwapTotalVolume/?timestamp=${dayTimestamp}&chain=${chain}`
      );

      return {
        dailyVolume: dailyVolume.volume,
        totalVolume: totalVolume.volume,
        timestamp: dayTimestamp,
      };
    };

const adapter: SimpleAdapter = {
  adapter: {},
};

chains.map((chain) => {
  adapter.adapter[chain] = {
    fetch: fetch(chain),
    start: startTimestamp,
  };
});

export default adapter;
