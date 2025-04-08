import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request from "graphql-request";

type TStartTime = {
  [key: string]: number;
};

const startTimeV2: TStartTime = {
  [CHAIN.SONIC]: 1735129946,
};

export const v2Endpoints: any = {
  [CHAIN.SONIC]:
    sdk.graph.modifyEndpoint("HGyx7TCqgbWieay5enLiRjshWve9TjHwiug3m66pmLGR"),
};

interface IGraphRes {
  volume: number;
  fees: number;
}

export async function fetchStats(options: FetchOptions, isCL: boolean): Promise<IGraphRes> {
  const entity = isCL ? "clPoolHourDatas" : "legacyPoolHourDatas"

  const rows: any[] = []
  const perPage = 1000
  let page = 0

  do {
    const query = `
      {
        ${entity}(
          where: {
            startOfHour_gt: ${options.startTimestamp},
            startOfHour_lt: ${options.endTimestamp}
          },
          first: ${perPage},
          skip: ${page * perPage}
        ) {
          volumeUSD
          feesUSD
        }
      }
    `;

    const tmpRows = await request(v2Endpoints[options.chain], query);
    rows.push(...tmpRows[entity])
    page += 1
    
  } while (rows.length % 1000 === 0)

  const volume = rows.reduce((prev: any, current: any) => prev + Number(current.volumeUSD), 0)
  const fees = rows.reduce((prev: any, current: any) => prev + Number(current.feesUSD), 0)

  return { volume, fees }
}

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options, true)

  const dailyFees = stats.fees
  const dailyVolume = stats.volume

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };

}

const methodology = {
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: startTimeV2[CHAIN.SONIC],
      meta: {
        methodology: methodology
      },
    },
  },
};

export default adapter;
