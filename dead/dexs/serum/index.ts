import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { gql, GraphQLClient } from "graphql-request";
import { getEnv } from "../../helpers/env";

const endpoint = "https://api.vybenetwork.com/v1/graphql";

const query = gql`
  query QueryVolume {
    api_serum_dex_m {
      globalVolumeStats {
        t
        v
      }
    }
  }
`;

const graphQLClient = new GraphQLClient(endpoint);
const getGQLClient = () => {
  graphQLClient.setHeader("authorization", getEnv('PROD_VYBE_API_KEY'))
  return graphQLClient
}

interface IGraphResponse {
  api_serum_dex_m: {
    globalVolumeStats: {
      t: number[]
      v: number[]
    }
  }
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))

  const data: IGraphResponse = await getGQLClient().request(query);

  const dailyVolumeIndex = data.api_serum_dex_m.globalVolumeStats.t.findIndex(t => t === dayTimestamp);

  return {
    dailyVolume: dailyVolumeIndex ? `${data.api_serum_dex_m.globalVolumeStats.v[dailyVolumeIndex]}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const data: IGraphResponse = await getGQLClient().request(query);
  return data.api_serum_dex_m.globalVolumeStats.t[0]
}

const adapter: SimpleAdapter = {
  deadFrom: '2023-09-12',
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
    },
  },
};

export default adapter;

// Todo Total volume and backfill
