import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-base-analytics-083/latest/gn";

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x8Ab178C07184ffD44F0ADfF4eA2ce6cFc33F3b86" }
    ) {
      platformFee
    }
  }
`;

interface IGraphResponse {
  dailyHistories: Array<{
    platformFee: string;
  }>;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(options.startTimestamp),
    to: String(options.endTimestamp),
  });

  let dailyFees = 0;

  response.dailyHistories.forEach((data) => {
    dailyFees += Number(data.platformFee) / 1e18;
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Trading fee paid by the user.",
  Revenue: "Trading fees collected from the users.",
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2023-11-01",
    },
  },
};
export default adapter;
