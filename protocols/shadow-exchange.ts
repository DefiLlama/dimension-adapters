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
  clVolumeUSD: number;
  clFeesUSD: number;
  legacyVolumeUSD: number;
  legacyFeesUSD: number;
}

export async function fetchStats(options: FetchOptions): Promise<IGraphRes> {
  const query = `
    {
      clProtocolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
        startOfDay
        volumeUSD
        feesUSD
      }
      legacyProtocolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
        startOfDay
        volumeUSD
        feesUSD
      }
    }
  `;
  const rows = await request(v2Endpoints[options.chain], query);

  return {
    clVolumeUSD: Number(rows.clProtocolDayDatas?.[0]?.volumeUSD ?? 0),
    clFeesUSD: Number(rows.clProtocolDayDatas?.[0]?.feesUSD ?? 0),
    legacyVolumeUSD: Number(rows.legacyProtocolDayDatas?.[0]?.volumeUSD ?? 0),
    legacyFeesUSD: Number(rows.legacyProtocolDayDatas?.[0]?.feesUSD ?? 0),
  }
}

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options)

  const dailyFees = stats.clFeesUSD
  const dailyVolume = stats.clVolumeUSD

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
