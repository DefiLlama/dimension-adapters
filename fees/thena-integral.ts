import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPoolData {
  id: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('BoHp9H2rGzVFPiqc56PJ1Gw7EPDaiHMcupsUuksMGp2K')
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400)
  const graphQuery = gql
    `
      {
        fusionDayData(id: ${dateId}) {
          id
          feesUSD
        }
      }
    `;

  const graphRes: IPoolData = (await request(endpoints[options.chain], graphQuery)).fusionDayData;
  const dailyFeeUSD = graphRes;
  const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
  if (dailyFee === undefined) return {}

  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: dailyFee.toString(),
    dailyHoldersRevenue: dailyFee.toString(),
  };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-11-18',
};

export default adapter;
