import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoint =
  "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx_analytics_base/0.8.2/gn";

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: {
        timestamp_gte: $from
        timestamp_lte: $to
        accountSource: "0x6D63921D8203044f6AbaD8F346d3AEa9A2719dDD"
      }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(
      where: { accountSource: "0x6D63921D8203044f6AbaD8F346d3AEa9A2719dDD" }
    ) {
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

const fetchVolume = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });

  // Merging both responses
  let dailyFees = new BigNumber(0);
  response.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });

  let totalFees = new BigNumber(0);
  response.totalHistories.forEach((data) => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));
  totalFees = totalFees.dividedBy(new BigNumber(1e18));

  const _dailyFees = toString(dailyFees);
  const _totalFees = toString(totalFees);

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = "0";
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = "0";

  const totalUserFees = _totalFees;
  const totalRevenue = _totalFees;
  const totalProtocolRevenue = "0";
  const totalSupplySideRevenue = "0";

  return {
    dailyFees: _dailyFees ?? "0",
    totalFees: _totalFees ?? "0",

    dailyUserFees: dailyUserFees ?? "0",
    dailyRevenue: dailyRevenue ?? "0",
    dailyProtocolRevenue: dailyProtocolRevenue ?? "0",
    dailyHoldersRevenue: dailyHoldersRevenue ?? "0",
    dailySupplySideRevenue: dailySupplySideRevenue ?? "0",
    totalUserFees: totalUserFees ?? "0",
    totalRevenue: totalRevenue ?? "0",
    totalProtocolRevenue: totalProtocolRevenue ?? "0",
    totalSupplySideRevenue: totalSupplySideRevenue ?? "0",
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchVolume,
      start: "2024-05-01",
    },
  },
};
export default adapter;
