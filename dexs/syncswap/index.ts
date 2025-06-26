import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResult, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";  
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { gql, request } from "graphql-request";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: sdk.graph.modifyEndpoint('3PCPSyJXMuC26Vi37w7Q6amJdEJgMDYppfW9sma91uhj'),
  [CHAIN.LINEA]: sdk.graph.modifyEndpoint('FtD3LWqSkwqkbASAwin4xFnN5bu2qJF6iPGVCs33uZja'),
  [CHAIN.SCROLL]: sdk.graph.modifyEndpoint('9ZCxNv8qiz97b5AEMnafsixYG7c2mnGp5Yk325p3gz9e'),
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon',
};

const graphsV2 = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "syncSwapFactories",
  },
  feesPercent: {
    type: "volume" as "volume",
    Fees: 0.3,
    UserFees: 0.3,
    SupplySideRevenue: 0.3,
  },
});

async function getGraphData(_t: number,_a:any,options: FetchOptions): Promise<FetchResult> {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400);
  const query = gql`
    {
      dayData(id: "${dateId}") {
        dailyVolumeUSD
      }
    }
  `
  const graphRes = await request(endpoints[options.chain], query);
  return {
    timestamp: options.startOfDay,
    dailyVolume: Number(graphRes.dayData.dailyVolumeUSD),
  }
}
const meta = {
  methodology: {
    ProtocolRevenue: "The revenue of the agreement comes from users purchasing security services, and the total cost equals the revenue.",
    Fees: "All fees comes from users for security service provided by GoPlus Network."
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ERA]: {
      fetch: getGraphData,  
      start: '2024-03-06',
      meta: meta
    },
    [CHAIN.LINEA]: {
      fetch: getGraphData,
      start: '2024-03-06',
      meta: meta
    },
    // [CHAIN.SOPHON]: {
    //   fetch: getGraphData,
    //   start: '2024-03-06',
    //   meta: meta
    // },
    [CHAIN.SCROLL]: {
      fetch: getGraphData,
      start: '2024-03-06',
      meta: meta
    },
  }
}

export default adapter
