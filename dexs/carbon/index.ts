import request, { gql } from "graphql-request";
import {
  FetchOptions,
  FetchResultVolume,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const baseEndpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-base-analytics-083/latest/gn";

const queryBase = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: {
        timestamp_gte: $from
        timestamp_lte: $to
        accountSource: "0x39EcC772f6073242d6FD1646d81FA2D87fe95314"
      }
    ) {
      tradeVolume
    }
  }
`;

interface IGraphResponse {
  dailyHistories: Array<{
    tradeVolume: string;
  }>;
}

const fetch = async (
  _a: any,
  _b: any,
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const response: IGraphResponse = await request(baseEndpoint, queryBase, {
    from: String(options.startTimestamp),
    to: String(options.endTimestamp),
  });

  let dailyVolume = 0;

  response.dailyHistories.forEach((data) => {
    dailyVolume += Number(data.tradeVolume) / 1e18;
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2023-11-01",
    },
  },
};

export default adapter;
