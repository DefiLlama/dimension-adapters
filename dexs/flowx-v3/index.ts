import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const graphQLClient = new GraphQLClient(
  "https://api.flowx.finance/flowx-be/graphql"
);

const getFees = () => {
  return gql`
    query GetClmmExchangeTotalFeesInPeriod(
      $startTime: Float!
      $endTime: Float!
    ) {
      getClmmExchangeTotalFeesInPeriod(
        startTime: $startTime
        endTime: $endTime
      ) {
        totalFees
      }
    }
  `;
};

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const feesRes = await graphQLClient.request(getFees(), {
    startTime: fromTimestamp * 1000,
    endTime: toTimestamp * 1000,
  });

  const totalFees = parseFloat(feesRes.getClmmExchangeTotalFeesInPeriod?.totalFees || "0");

  // Assuming the totalFees from API represents total swap fees collected
  // Using a conservative estimate of 0.05% average fee rate for CLMM
  // Volume = Total Fees / Fee Rate
  const estimatedVolume = totalFees / 0.0005;

  return {
    dailyVolume: estimatedVolume.toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2024-05-10",
    },
  },
  methodology: {
    Volume: "Daily trading volume estimated from FlowX CLMM fees data. Volume = Total Fees / 0.0005 (assuming 0.05% average fee rate).",
  },
};

export default adapter;
