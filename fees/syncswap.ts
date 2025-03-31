import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";  
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.ERA]: sdk.graph.modifyEndpoint('3PCPSyJXMuC26Vi37w7Q6amJdEJgMDYppfW9sma91uhj'),
  [CHAIN.LINEA]: sdk.graph.modifyEndpoint('9R6uvVYXn9V1iAxkTLXL1Ajka75aD7mmHRj86DbXnyYQ'),
  [CHAIN.SCROLL]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-scroll',
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

async function getGraphData(options: FetchOptions): Promise<FetchResultV2> {
  try {
    let dailyFees = 0;

    const v2Values = (await graphsV2(options.chain)(options));
    const v2DailyFees = v2Values?.dailyFees || 0
    dailyFees += Number(v2DailyFees.toString())

    return {
      dailyFees: dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees,
    }
  } catch {
    return {
      dailyFees: 0,
      dailyUserFees: 0,
      dailySupplySideRevenue: 0,
    }
  }
}
const meta = {
  methodology: {
    ProtocolRevenue: "The revenue of the agreement comes from users purchasing security services, and the total cost equals the revenue.",
    Fees: "All fees comes from users for security service provided by GoPlus Network."
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: getGraphData as FetchV2,
      start: '2024-03-06',
      meta: meta
    },
    [CHAIN.LINEA]: {
      fetch: getGraphData as FetchV2,
      start: '2024-03-06',
      meta: meta
    },
    [CHAIN.SOPHON]: {
      fetch: getGraphData as FetchV2,
      start: '2024-03-06',
      meta: meta
    },
    [CHAIN.SCROLL]: {
      fetch: getGraphData as FetchV2,
      start: '2024-03-06',
      meta: meta
    },
  }
}

export default adapter
