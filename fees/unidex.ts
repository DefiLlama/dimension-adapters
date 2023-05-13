import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";

type TUrl = {
  [l: string | Chain]: string;
}
const endpoints: TUrl = {
  [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/optimismleverage',
  [CHAIN.ERA]: 'https://zksync.tempsubgraph.xyz/subgraphs/name/unidex-finance/zkssyncleverage',
  [CHAIN.FANTOM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/unidexleverage',
  [CHAIN.BOBA]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/bobaleverage',
  [CHAIN.METIS]: 'https://unidexcronos.xyz/subgraphs/name/unidex-finance/leverage',
  [CHAIN.BSC]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/bscleverage'
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
    const dailyHoldersRevenue = dailyFee * 0.3;
    const dailyProtocolRevenue = dailyFee * 0.4;
    const dailySupplySideRevenue = dailyFee * 0.6;
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

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM),
        start: async ()  => 1675382400,
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: async ()  => 1675382400,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1675382400,
    },
    [CHAIN.BOBA]: {
      fetch: fetch(CHAIN.BOBA),
      start: async ()  => 1675382400,
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: async ()  => 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async ()  => 1675382400,
    },
  }
}

export default adapter;
