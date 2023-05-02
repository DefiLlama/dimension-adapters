import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

interface IData {
  date: number;
  cumulativeFee: string;
}

type IURL = {
  [l: string | Chain]: string;
}

interface IFees {
  vaultDayData: IData;
  vaults: IData[];
}

const endpoints: IURL = {
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/ethandev0/pikaperpv3_optimism"
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
    const block = (await getBlock(todayTimestamp, chain, {}));
    const graphQuery = gql
      `
      {
        vaultDayData(id: ${dateId}) {
          date
          id
          cumulativeFee
        }
      }
    `;

    const res: IFees = (await request(endpoints[chain], graphQuery));
    const dailyFees = Number(res.vaultDayData.cumulativeFee) / 10 ** 8;
    const dailySupplySideRevenue = dailyFees * 0.5;
    const dailyProtocolRevenue = dailyFees * 0.3;

    return {
      timestamp,
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyProtocolRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    };
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1658534400,
    },
  },
};

export default adapter;
