import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import { Adapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://satsuma-dump.buffer.finance/",
};

export function _getDayId(timestamp: number): string {
  let dayTimestamp = Math.floor((timestamp - 16 * 3600) / 86400);
  return dayTimestamp.toString();
}

const graphs = (baseUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = _getDayId(timestamp);

      const url = new URL(baseUrls[chain]);
      url.searchParams.append("day", dateId);

      const response = await fetch(url);
      const dailyFee = (await response.json()).fee / 1000000;
      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1674950400,
    },
  },
  version: 1,
};

export default adapter;
