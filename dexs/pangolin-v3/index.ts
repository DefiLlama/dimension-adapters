import * as sdk from "@defillama/sdk";
import { request } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

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

const meta = {
  methodology: {
    Fees: 'Fees paid by users for swaps',
    UserFees: 'Fees paid by users for swaps',
    Revenue: '10% Fees to Pangolin Protocol treasury, 10% to PNG stakers',
    ProtocolRevenue: '10% Fees to Pangolin Protocol treasury',
    SupplySideRevenue: '80% Fees to liquidity providers',
    HoldersRevenue: '10% Fees to PNG stakers'
  }
}

const adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2025-04-04',
      meta
    }
  }
}

export default adapter;

