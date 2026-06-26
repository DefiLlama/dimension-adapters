import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IData {
  date: number;
  cumulativeVolume: string;
}

interface IValume {
  vaultDayData: IData;
  vaults: IData[];
}

const endpoints: Record<string, string> = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('DUcxevdqV8kBQdHWcdUcaEctaoVyqYZTtCftojL23NbA')
}

const fetch = async (options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400)
  const graphQuery = gql
    `
      {
        vaultDayData(id: ${dateId}) {
          date
          id
          cumulativeVolume
        }
      }
    `;

  const res: IValume = (await request(endpoints[options.chain], graphQuery));
  const dailyVolume = Number(res.vaultDayData?.cumulativeVolume || 0) / 10 ** 8;

  return {
    dailyVolume,
  };
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: '2022-07-23',
};

export default adapter;
