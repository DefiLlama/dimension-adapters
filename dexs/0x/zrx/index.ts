import { GraphQLClient, gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../../helpers/getUniSubgraphVolume";
import { getEnv } from "../../../helpers/env";
import { FetchOptions } from "../../../adapters/types";
import { CHAIN } from "../../../helpers/chains";

type TChain = {
  [key: string]: string;
}
const CHAINS: TChain = {
  [CHAIN.ARBITRUM]: "Arbitrum",
  [CHAIN.AVAX]: "Avalanche",
  [CHAIN.BASE]: "Base",
  [CHAIN.BSC]: "BSC",
  [CHAIN.CELO]: "Celo",
  [CHAIN.ETHEREUM]: "Ethereum",
  [CHAIN.FANTOM]: "Fantom",
  [CHAIN.OPTIMISM]: "Optimism",
  [CHAIN.POLYGON]: "Polygon",
};

const graphQLClient = new GraphQLClient("https://api.0x.org/data/v0");
const getGQLClient = () => {
  graphQLClient.setHeader("0x-api-key", getEnv("AGGREGATOR_0X_API_KEY"));

  return graphQLClient;
};

const getVolumeByChain = async (chain: string) => {
  const client = getGQLClient();
  const req = gql`
    query Query_root {
      aggTransactionsDailyRouter(
        order_by: [{ timestamp: desc, chainName: null }]
        where: { chainName: { _eq: ${chain} } }
      ) {
        chainName
        timestamp
        transactions
        volumeUSD
      }
    }
  `;

  const data = (await client.request(req))["aggTransactionsDailyRouter"];
  return data;
};

const fetch = async (options: FetchOptions) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(
    new Date(options.endTimestamp * 1000)
  );
  try {
    const data = await getVolumeByChain(options.chain);
    const strDate = new Date(unixTimestamp * 1000).toISOString().split("T")[0];
    const dayData = data.find(
      ({ timestamp }: { timestamp: string }) =>
        timestamp.split("T")[0] === strDate
    );
    return {
      dailyVolume: dayData.volumeUSD,
      timestamp: unixTimestamp,
    };
  } catch (e) {
    console.error(e);
    return {
      dailyVolume: "0",
      timestamp: unixTimestamp,
    };
  }
};

const adapter_aggs: any = {
  version: 2,
  adapter: {
    ...Object.values(CHAINS).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch,
          start: 0,
        },
      };
    }, {}),
  },
};
export {
  adapter_aggs
}
