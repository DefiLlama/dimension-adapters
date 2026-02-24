import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import fetchURL from "../../utils/fetchURL";

const BASE_URL = "https://api.hyperion.xyz/v1/graphql";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const query = gql`
    query defillamaStats($timestamp: Float!) {
      api {
        getVolumeFeeStat(timestamp: $timestamp) {
          dailyFees
        }
      }
    }
  `;

  const poolList: Array<{ dailyVolumeUSD: string }> = (
    await fetchURL(
      `https://assets.hyperion.xyz/files/pool-list.json?t=${dayTimestamp}`
    )
  ).data;

  const dailyVolume = poolList.reduce(
    (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
    0
  );

  const variables = {
    timestamp: dayTimestamp,
  };

  const data = await request(BASE_URL, query, variables);
  const dailyFees = data.api.getVolumeFeeStat.dailyFees;
  const dailyRevenue = Number(dailyFees) * 0.2;

  return {
    dailyFees,
    dailyRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Total Fee user pays for the trades",
    Revenue: "Revenue is calculated as 0.2% of the daily fees",
  },
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2025-02-04",
    },
  },
};

export default adapter;
