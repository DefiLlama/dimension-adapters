import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

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

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });

  let dailyVolume = new BigNumber(0);
  response.dailyHistories.forEach((data) => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
  });

  let totalVolume = new BigNumber(0);
  response.totalHistories.forEach((data) => {
    totalVolume = totalVolume.plus(new BigNumber(data.tradeVolume));
  });

  dailyVolume = dailyVolume.dividedBy(new BigNumber(1e18));
  totalVolume = totalVolume.dividedBy(new BigNumber(1e18));

  const _dailyVolume = toString(dailyVolume);
  const _totalVolume = toString(totalVolume);

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  return {
    timestamp: dayTimestamp,
    dailyVolume: _dailyVolume ?? "0",
    totalVolume: _totalVolume ?? "0",
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchVolume,
      start: async () => 236678,
    },
  },
};

export default adapter;
