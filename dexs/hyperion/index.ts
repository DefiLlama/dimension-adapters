import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";

interface VolumeFeeStat {
  api: {
    getVolumeFeeStat: {
      dailyVolume: number;
      dailyFees: number;
      totalVolume: number;
      totalFees: number;
    };
  };
}

const BASE_URL = "https://api.hyperion.xyz/v1/graphql";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const query = gql`
    query defillamaStats($timestamp: Float!) {
      api {
        getVolumeFeeStat(timestamp: $timestamp) {
          dailyFees
          totalFees
          totalVolume
          dailyVolume
        }
      }
    }
  `;

  const variables = {
    timestamp: dayTimestamp,
  };

  const data = await request<VolumeFeeStat>(BASE_URL, query, variables);

  const res = {
    totalVolume: `${data.api.getVolumeFeeStat.totalVolume}`,
    dailyVolume: `${data.api.getVolumeFeeStat.dailyVolume}`,
    dailyFees: `${data.api.getVolumeFeeStat.dailyFees}`,
    totalFees: `${data.api.getVolumeFeeStat.totalFees}`,
    timestamp: timestamp,
  };

  return res;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2025-02-04",
    },
  },
};

export default adapter;
