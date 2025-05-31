import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import { httpGet } from "../../utils/fetchURL";

interface VolumeFeeStat {
  api: {
    getVolumeFeeStat: {
      dailyFees: string;
      totalFees: string;
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
        }
      }
    }
  `;

  const poolList: Array<{ dailyVolumeUSD: string }> = (await httpGet(`https://assets.hyperion.xyz/files/pool-list.json?t=${dayTimestamp}`)).data;
  const dailyVolume = poolList.reduce((acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD), 0);

  const variables = {
    timestamp: dayTimestamp,
  };

  const data = await request(BASE_URL, query, variables);

  const res = {
    dailyFees: `${data.api.getVolumeFeeStat.dailyFees}`,
    dailyVolume: `${dailyVolume}`,
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
