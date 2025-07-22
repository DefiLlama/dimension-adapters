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
      }
    }
  `
  const response = await request(GRAPH_URL, query)
  const dayData = response.pangolinDayDatas.find((day: any) => day.date === unixTimestamp)

  return {
    dailyVolume: dayData.volumeUSD
  }
}


const adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2025-04-04'
    }
  }
}

export default adapter;

