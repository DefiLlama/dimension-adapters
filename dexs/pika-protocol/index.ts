import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getBlock } from "../../helpers/getBlock";

interface IData {
  date: number;
  cumulativeVolume: string;
}

type IURL = {
  [l: string | Chain]: string;
}

interface IValume {
  vaultDayData: IData;
  vaults: IData[];
}

const endpoints: IURL = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('DUcxevdqV8kBQdHWcdUcaEctaoVyqYZTtCftojL23NbA')
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
    const block = (await getBlock(todayTimestamp, chain, {}));
    const graphQuery = gql
      `
      {
        vaultDayData(id: ${dateId}) {
          date
          id
          cumulativeVolume
        }
        vaults(block: { number: ${block} }) {
          cumulativeVolume
        }
      }
    `;

    const res: IValume = (await request(endpoints[chain], graphQuery));
    const dailyVolume = Number(res.vaultDayData?.cumulativeVolume || 0) / 10 ** 8;
    const totalVolume = Number(res.vaults[0]?.cumulativeVolume || 0) / 10 ** 8;

    return {
      timestamp,
      dailyVolume: dailyVolume.toString(),
      totalVolume: totalVolume.toString()
    };
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2022-07-23',
    },
  },
};

export default adapter;
