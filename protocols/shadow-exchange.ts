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

interface IPool {
  id: string;
  volumeUSD: string;
  feesUSD: string;
  isCL: boolean;
}

export async function fetchPools(options: FetchOptions): Promise<IPool[]> {
  const query = `
    {
      clPoolDayDatas(where:{startOfDay: ${options.startOfDay}}, first: 1000) {
        startOfDay
        volumeUSD
        feesUSD
      }
      legacyPoolDayDatas(where:{startOfDay: ${options.startOfDay}}, first: 1000) {
        startOfDay
        volumeUSD
        feesUSD
      }
    }
  `;
  const rows = await request(v2Endpoints[options.chain], query);

  const res: IPool[] = [
    ...rows.clPoolDayDatas.map((row: any) => ({ ...row, isCL: true })),
    ...rows.legacyPoolDayDatas.map((row: any) => ({ ...row, isCL: false })),
  ]

  return res
}

const fetch = async (options: FetchOptions) => {
  const pools = (await fetchPools(options)).filter((pool) => pool.isCL)
  const dailyFees = pools.reduce((acc, pool) => acc + Number(pool.feesUSD), 0);
  const dailyVolume = pools.reduce((acc, pool) => acc + Number(pool.volumeUSD), 0);

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
