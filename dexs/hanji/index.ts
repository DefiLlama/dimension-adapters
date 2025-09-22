import request, { gql } from "graphql-request";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const ENDPOINTS = {
  [CHAIN.ETHERLINK]: "https://api.studio.thegraph.com/query/61208/onchain-clob-etherlink/version/latest"
}

interface IGraph {
  dailyVolume: {
    volumeUsd: string;
  };
  dailyFees: {
    feesUsd: string;
    userFeesUsd: string;
    revenueUsd: string;
  };
}

const getData = async (chain: string, timestamp: number) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400) * 86400;

  const query = gql`{
    dailyVolume(id: ${dateId}) {
      volumeUsd
    }
    dailyFees(id: ${dateId}) {
      feesUsd
      userFeesUsd
      revenueUsd
    }
  }
  `;

  const data: IGraph = await request(ENDPOINTS[chain], query);

  const dailyVolume = Number(data.dailyVolume?.volumeUsd ?? "0");
  const dailyFees = Number(data.dailyFees?.feesUsd ?? "0");
  const dailyUserFees = Number(data.dailyFees?.userFeesUsd ?? "0");
  const dailyRevenue = Number(data.dailyFees?.revenueUsd ?? "0");

  return {
    dailyFees: `${dailyFees}`,
    dailyUserFees: `${dailyUserFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyVolume: `${dailyVolume}`,
    timestamp: timestamp,
  };
};

export const fetchVolume = async (options: FetchOptions) => {
  const data = await getData(options.chain, options.startOfDay);
  return {
    dailyVolume: data.dailyVolume
  };
};

export const fetchFee = (chain: string) => {
  return async (timestamp: number) => {
    const data = await getData(chain, timestamp);
    return {
      timestamp: data.timestamp,
      dailyFees: data.dailyFees,
      dailyUserFees: data.dailyUserFees,
      dailyRevenue: data.dailyRevenue
    };
  };
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHERLINK]: {
      fetch: fetchVolume,
    },
  },
};

export default adapters;
