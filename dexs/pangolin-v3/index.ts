import * as sdk from "@defillama/sdk";
import { request } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const GRAPH_URL = sdk.graph.modifyEndpoint(
  "Fz7s5upsgHoM1mv3bxHMZkiAT6xtFXUyp5YXmHX5tq35",
)

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const unixTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)
  const query = `
    query q {
      pangolinDayDatas(orderBy: date, orderDirection: desc, first: 1000) {
        date
        volumeUSD
        feesUSD
      }
    }
  `
  const response = await request(GRAPH_URL, query)
  const dayData = response.pangolinDayDatas.find((day: any) => day.date === unixTimestamp)
  const dailyVolume = dayData.volumeUSD
  const dailyFees = dayData.feesUSD
  const dailySupplySideRevenue = dailyFees * 0.8
  const dailyRevenue = dailyFees * 0.2
  const dailyProtocolRevenue = dailyFees * 0.1


  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue: dailyProtocolRevenue
  }
}

const methodology = {
  Fees: 'Fees paid by users for swaps',
  UserFees: 'Fees paid by users for swaps',
  Revenue: '10% Fees to Pangolin Protocol treasury, 10% to PNG stakers',
  ProtocolRevenue: '10% Fees to Pangolin Protocol treasury',
  SupplySideRevenue: '80% Fees to liquidity providers',
  HoldersRevenue: '10% Fees to PNG stakers'
}

const adapter = {
  methodology,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2025-04-04',
    },
    [CHAIN.MONAD]: {
      fetch: async function(_a: any, _b: any, options: FetchOptions) {
        const fetch = getUniV3LogAdapter({ factory: '0x44805F92db5bB31B54632A55fc4b2B7E885B0e0e', userFeesRatio: 1, revenueRatio: 0.2, protocolRevenueRatio: 0.1, holdersRevenueRatio: 0.1 });
        return fetch(options);
      },
      start: '2025-11-25',
    }
  }
}

export default adapter;

