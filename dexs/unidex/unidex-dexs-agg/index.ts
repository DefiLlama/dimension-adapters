import { FetchResult } from "../../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../../helpers/chains";
import { httpGet } from "../../../utils/fetchURL";

const chainsMap: Record<string, string> = {
  ETHEREUM: "ethereum",
  ARBITRUM: "arbitrum",
  POLYGON: "polygon",
  BNB: "bsc",
  OPTIMISM: "optimism",
  BASE: "base",
  FANTOM: "fantom",
  METIS: "metis",
  GNOSIS: "gnosis",
  [CHAIN.ERA]: "zksync",
  AVALANCHE: "avax",
};

const fetch =
  (chain: string) =>
    async (timestamp: number): Promise<FetchResult> => {
      try {
        const unixTimestamp = getUniqStartOfTodayTimestamp();

        const response = await httpGet(`https://unidexswaps.metabaseapp.com/api/public/dashboard/f0dd81ef-7bc7-47b5-9ac4-281c7cd71bdc/dashcard/11/card/12?parameters=%5B%5D`)

        const rows = response.data.rows;
        const chainData = rows.find(
          (row: any) => row[1].toLowerCase() === chain
        );

        return {
          dailyVolume: chainData ? chainData[2]?.toString() : "0",
          timestamp: unixTimestamp,
        };
      } catch (e: any) {
        return {
          dailyVolume: "0",
          timestamp: timestamp,
        }
      }
    };

const adapter_dexs_agg: any = {
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          runAtCurrTime: true,
          start: '2024-01-04',
        },
      };
    }, {}),
  },
};

export {
  adapter_dexs_agg
}
