import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://api.studio.thegraph.com/query/62472/core-analytics-082/version/latest";

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0xd6ee1fd75d11989e57B57AA6Fd75f558fBf02a5e" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: { accountSource: "0xd6ee1fd75d11989e57B57AA6Fd75f558fBf02a5e" }) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
  totalHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: BigNumber;
  }>;
}

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined;
  return x.toString();
};

const fetchVolume = async ({ startTimestamp, endTimestamp }: FetchOptions) => {

  const response: IGraphResponse = await request(endpoint, query, {
    from: startTimestamp,
    to: endTimestamp,
  });

  // Merging both responses
  let dailyFees = new BigNumber(0);

  response.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));

  const _dailyFees = toString(dailyFees);

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = "0";
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = "0";

  return {
    dailyFees: _dailyFees,

    dailyUserFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch: fetchVolume,
    },
  },
  version: 2
};
export default adapter;
