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
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx_analytics_base/0.8.2/gn",
  [CHAIN.MODE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx_analytics_mode/0.8.2/gn",
};

const freestyleQueries: { [key: string]: string } = {
  [CHAIN.BASE]: gql`
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
  `,
  [CHAIN.MODE]: gql`
    query stats($from: String!, $to: String!) {
      dailyHistories(
        where: {
          timestamp_gte: $from
          timestamp_lte: $to
          accountSource: "0xC0ff4B56f62f20bA45f4229CC6BAaD986FA2a904"
        }
      ) {
        timestamp
        platformFee
        accountSource
        tradeVolume
      }
      totalHistories(
        where: { accountSource: "0xC0ff4B56f62f20bA45f4229CC6BAaD986FA2a904" }
      ) {
        timestamp
        platformFee
        accountSource
        tradeVolume
      }
    }
  `,
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

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined;
  return x.toString();
};

const fetch = async ( _a: any, _b: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const startTime = options.startOfDay;
  const endTime = startTime + ONE_DAY_IN_SECONDS;
  const response: IGraphResponseFreestyle = await request(
    freestyleEndpoints[options.chain],
    freestyleQueries[options.chain],
    {
      from: String(startTime),
      to: String(endTime),
    }
  );

  let dailyVolume = new BigNumber(0);

  response.dailyHistories.forEach((data) => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
  });

  dailyVolume = dailyVolume.dividedBy(new BigNumber(1e18));

  const _dailyVolume = toString(dailyVolume);

  return {
    dailyVolume: _dailyVolume || "0",
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2024-05-01",
    },
    [CHAIN.MODE]: {
      fetch,
      start: "2024-05-01",
    },
  },
};

export default adapter;
