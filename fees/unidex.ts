import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";

type TUrl = {
  [l: string | Chain]: string;
}
const endpoints: TUrl = {
  [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/optimismleveragev2',
  [CHAIN.ERA]: 'https://zksync.tempsubgraph.xyz/subgraphs/name/unidex-finance/zkssyncleveragev2',
  [CHAIN.FANTOM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/fantomleveragev2',
  [CHAIN.METIS]: 'https://unidexcronos.xyz/subgraphs/name/unidex-finance/leveragev2',
}

interface IDTrade {
  cumulativeFees: string;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const graphQuery = gql
      `
      {
        dayDatas(where:{ date: "${todaysTimestamp}"}) {
          cumulativeFees
        }
      }
    `;

    const graphRes: IDTrade[] = (await request(endpoints[chain], graphQuery)).dayDatas;
    const dailyFee = Number(graphRes[0]?.cumulativeFees || 0) / 10 ** 8;
    const dailyHoldersRevenue = dailyFee * 0.35;
    const dailyProtocolRevenue = dailyFee * 0.70;
    const dailySupplySideRevenue = dailyFee * 0.3;
    return {
      dailyFees: dailyFee.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
      dailyRevenue: dailyProtocolRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      timestamp
    }
  }
}

const methodology = {
  Fees: "Fees collected from user trading fees",
  Revenue: "Fees going to the treasury + holders",
  HoldersRevenue: "Fees going to token holders",
  SupplySideRevenue: "Fees going to liquidity providers of counter party pools"
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM),
        start: async ()  => 1687422746,
        meta: {
          methodology
        }
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: async ()  => 1687422746,
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1687422746,
      meta: {
        methodology
      }
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: async ()  => 1687898060,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
