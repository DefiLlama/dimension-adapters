import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";

const BASE_URL = "https://api.hyperion.xyz/v1/graphql";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const query = gql`
    query defillamaStats($timestamp: Float!) {
      api {
        getVaultsFeeStat(timestamp: $timestamp) {
          dailyFees
        }
      }
    }
  `;

  const variables = {
    timestamp: dayTimestamp,
  };

  const data = await request(BASE_URL, query, variables);
  const dailyFees = data.api.getVaultsFeeStat.dailyFees;
  const dailyRevenue = Number(dailyFees) * 0.5;

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-01-12",
    },
  },
  methodology: {
    Fees: "The fee is charged 20% of our reward received",
    Revenue: "Revenue is calculated as 50% of the daily fees",
  },
};

export default adapter;
