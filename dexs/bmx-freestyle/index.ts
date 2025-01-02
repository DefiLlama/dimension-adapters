import BigNumber from "bignumber.js";
import {
  FetchOptions,
  FetchResultVolume,
  SimpleAdapter,
} from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const freestyleEndpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api-v2.morphex.trade/subgraph/3KhmYXgsM3CM1bbUCX8ejhcxQCtWwpUGhP7p9aDKZ94Z",
};

interface IGraphResponseFreestyle {
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

interface IGraphResponse {
  volumeStats: Array<{
    burn: string;
    liquidation: string;
    margin: string;
    mint: string;
    swap: string;
  }>;
}

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined;
  return x.toString();
};

const freestyleQuery = gql`
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

const fetchFreestyleVolume = async (
  timestamp: number,
  _t: any,
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const startTime = options.startOfDay;
  const endTime = startTime + ONE_DAY_IN_SECONDS;
  const response: IGraphResponseFreestyle = await request(
    freestyleEndpoints[options.chain],
    freestyleQuery,
    {
      from: String(startTime),
      to: String(endTime),
    }
  );

  let dailyVolume = new BigNumber(0);
  let totalVolume = new BigNumber(0);

  response.dailyHistories.forEach((data) => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
  });
  response.totalHistories.forEach((data) => {
    totalVolume = totalVolume.plus(new BigNumber(data.tradeVolume));
  });

  dailyVolume = dailyVolume.dividedBy(new BigNumber(1e18));
  totalVolume = totalVolume.dividedBy(new BigNumber(1e18));

  const _dailyVolume = toString(dailyVolume);
  const _totalVolume = toString(totalVolume);

  return {
    timestamp: timestamp,
    dailyVolume: _dailyVolume ?? "0",
    totalVolume: _totalVolume ?? "0",
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFreestyleVolume,
      start: '2024-05-01',
    },
  },
};

export default adapter;
