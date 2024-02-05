import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chainsMap: Record<string, string> = { ethereum: "eth" };
const chains = [
  "ethereum",
  "bsc",
  "polygon",
  "xdai",
  "fantom",
  "heco",
  "arbitrum",
  "optimism",
  "moonriver",
  "aurora",
  "metis",
  "kava",
  "celo",
  "zksync",
  "polygon_zkevm",
  "linea",
  "base",
];

const fetch =
  (chain: string) =>
    async (timestamp: number): Promise<FetchResult> => {
      const today = new Date();
      const timestampDate = new Date(timestamp * 1000);
      const unixTimestamp = getUniqStartOfTodayTimestamp(timestampDate);
      const dayDiff = today.getTime() - timestampDate.getTime();
      const daysPassed = (dayDiff / (1000 * 3600 * 24)).toFixed(0);
      const data = await fetchURL(
        `https://open-api.openocean.finance/v3/DefiLlama/volume?limit=${daysPassed || 1
        }&total=true`
      );

      return {
        dailyVolume: data.data[chainsMap[chain] || chain]?.volume,
        timestamp: unixTimestamp,
      };
    };

const adapter: any = {
  adapter: {
    ...chains.reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch(chain),
          start: new Date(2023, 6, 1).getTime() / 1000,
        },
      };
    }, {}),
  },
};

export default adapter;
