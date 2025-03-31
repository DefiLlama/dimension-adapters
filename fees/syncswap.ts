import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.ERA]: sdk.graph.modifyEndpoint('3PCPSyJXMuC26Vi37w7Q6amJdEJgMDYppfW9sma91uhj'),
  [CHAIN.LINEA]: sdk.graph.modifyEndpoint('9R6uvVYXn9V1iAxkTLXL1Ajka75aD7mmHRj86DbXnyYQ'),
  [CHAIN.SCROLL]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-scroll',
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon',
};

const v3Endpoints = {
  [CHAIN.ERA]: sdk.graph.modifyEndpoint('6pXVWtpsLXMLAyS7UU49ftu38MCSVh5fqVoSWLiLBkmP'),
  [CHAIN.LINEA]: sdk.graph.modifyEndpoint('FMDUEPFThYQZM6f2bXsRduB9pWQvDB9mPCBQc9C9gUed'),
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon-v3',
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

const graphsV3 = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    Fees: 100, // User fees are 100% of collected fees
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
  }
});

async function getGraphData(options: FetchOptions, chain: string): Promise<FetchResultV2> {
  try {
    let dailyFees = 0;

    const v2Values = (await graphsV2(chain)(options));
    const v2DailyFees = v2Values?.dailyFees || 0
    dailyFees += Number(v2DailyFees.toString())

    if (chain !== CHAIN.SCROLL) {
      const v3Values = (await graphsV3(chain)(options))
      const v3DailyFees = v3Values?.dailyFees || 0
      dailyFees += Number(v3DailyFees.toString())
    }

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

const adapter = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: async (options: FetchOptions) => {
        return await getGraphData(options, chain)
      },
      start: '2024-04-01',
      meta: {
        methodology: {
          Fees: "All fees from token swap.",
          UserFees: "User pays 0.05% - 1% fees on each swap.",
          SupplySideRevenue: "LPs receive 100% swap fees."
        }
      }
    },
  }),
  {}
) as any;

export default {
  version: 2,
  adapter: adapter,
};
