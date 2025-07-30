import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { graphDimensionFetch } from "../../helpers/getUniSubgraph";

const v2Endpoints = {
  [CHAIN.MANTLE]: "https://graphv3.fusionx.finance/subgraphs/name/fusionx/exchange"
}

const v2graph = graphDimensionFetch({
  graphUrls: v2Endpoints,
  dailyVolume: {
    factory: "fusionxDayData",
    field: "dailyVolumeUSD",
    dateField: "date"
  },
  dailyFees: {
    factory: 'fusionxDayData',
    field: 'dailyVolumeUSD',
  },
  feesPercent: {
    type: "volume",
    ProtocolRevenue: 0.04,
    HoldersRevenue: 0.04,
    Fees: 0.25, // 0.25% fees
    UserFees: 0.25, // User fees are 100% of collected fees
    SupplySideRevenue: 0.17, // 66% of fees are going to LPs
    Revenue: 0.08 // Revenue is 33% of collected fees
  }
}
)

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const res = await v2graph(_a, _b, options);
  res['dailyFees'] = res['dailyUserFees']
  return res;
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch,
      start: '2023-07-13',
    },
  },
};

export default adapter;
