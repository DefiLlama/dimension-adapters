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

const v2Endpoints: any = {
  [CHAIN.SONIC]:
    sdk.graph.modifyEndpoint('HGyx7TCqgbWieay5enLiRjshWve9TjHwiug3m66pmLGR'),
};

interface IPool {
  id: string;
  volumeUSD: string;
  feesUSD: string;
}

const fetch = async (options: FetchOptions) => {
  const query = `
      {
        clPoolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
          startOfDay
          volumeUSD
          feesUSD
        }
      }
  `;
  const res = await request(v2Endpoints[options.chain], query);
  const pools: IPool[] = res.clPoolDayDatas;
  const dailyFees = pools.reduce((acc, pool) => acc + Number(pool.feesUSD), 0);
  const dailyVolume = pools.reduce((acc, pool) => acc + Number(pool.volumeUSD), 0);
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };

}

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
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
