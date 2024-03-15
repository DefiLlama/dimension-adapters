import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const endpoint_0_8_0 = "https://api.thegraph.com/subgraphs/name/intent-x/perpetuals-analytics_base";
const endpoint = "https://api.studio.thegraph.com/query/62472/intentx-analytics_082/version/latest";
const endpoint_blast = "https://api.studio.thegraph.com/query/62472/intentx-analytics_082_blast/version/latest";

const query_0_8_0 = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x724796d2e9143920B1b58651B04e1Ed201b8cC98" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: { accountSource: "0x724796d2e9143920B1b58651B04e1Ed201b8cC98" }) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x8Ab178C07184ffD44F0ADfF4eA2ce6cFc33F3b86" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: { accountSource: "0x8Ab178C07184ffD44F0ADfF4eA2ce6cFc33F3b86" }) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const queryBlast = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x083267D20Dbe6C2b0A83Bd0E601dC2299eD99015" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: { accountSource: "0x083267D20Dbe6C2b0A83Bd0E601dC2299eD99015" }) {
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
  const response_0_8_0: IGraphResponse = await request(endpoint_0_8_0, query_0_8_0, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });
  const response_blast: IGraphResponse = await request(endpoint_blast, queryBlast, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });

  let dailyVolume = new BigNumber(0);
  response_0_8_0.dailyHistories.forEach((data) => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
  });
  response.dailyHistories.forEach((data) => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
  });
  response_blast.dailyHistories.forEach((data) => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
  });


  let totalVolume = new BigNumber(0);
  response_0_8_0.totalHistories.forEach((data) => {
    totalVolume = totalVolume.plus(new BigNumber(data.tradeVolume));
  });
  response.totalHistories.forEach((data) => {
    totalVolume = totalVolume.plus(new BigNumber(data.tradeVolume));
  });
  response_blast.totalHistories.forEach((data) => {
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
      start: 1698796800,
    },
  },
};

export default adapter;
