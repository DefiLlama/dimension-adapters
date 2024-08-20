import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2DimensionAdapter } from "../../helpers/getUniSubgraph";
import { SimpleAdapter } from "../../adapters/types";

const chainConfigs = {
  [CHAIN.AVAX]: {
    graphUrl:
      "https://subgraphs.fwx.finance/avac/subgraphs/name/fwx-exchange-avac",
    feesPercent: {
      UserFees: 0.1,
      Fees: 0.1,
      SupplySideRevenue: 0.075,
      ProtocolRevenue: 0.025,
      Revenue: 0.025,
    },
    methodology: {
      UserFees: "User pays 0.1% fees on each swap",
      Fees: "A 0.1% of each swap is collected as trading fees",
      SupplySideRevenue:
        "A 0.075% from each swap is distributed to liquidity providers",
      ProtocolRevenue: "A 0.025% fees goes to FWX treasury",
      Revenue: "Governance revenue is 0.025% trading fees",
    },
    start: 1717632000,
  },
  [CHAIN.BASE]: {
    graphUrl:
      "https://subgraphs.fwx.finance/base/subgraphs/name/fwx-exchange-base",
    feesPercent: {
      UserFees: 0.1,
      Fees: 0.1,
      SupplySideRevenue: 0.075,
      ProtocolRevenue: 0.025,
      Revenue: 0.025,
    },
    methodology: {
      UserFees: "User pays 0.25% fees on each swap",
      Fees: "A 0.25% of each swap is collected as trading fees",
      SupplySideRevenue:
        "A 0.20833% from each swap is distributed to liquidity providers",
      ProtocolRevenue: "A 0.04167% fees goes to FWX treasury",
      Revenue: "Governance revenue is 0.04167% trading fees",
    },
    start: 1722988800,
  },
};

const adapters: SimpleAdapter = {
  adapter: {},
  version: 2,
};

Object.entries(chainConfigs).reduce((acc, [chain, value]) => {
  adapters.adapter[chain] = {
    ...univ2DimensionAdapter(
      {
        graphUrls: {
          [chain]: sdk.graph.modifyEndpoint(value.graphUrl),
        },
        dailyVolume: {
          factory: "pancakeDayData",
        },
        totalVolume: {
          factory: "pancakeFactories",
        },
        feesPercent: { ...value.feesPercent, type: "volume" },
      },
      { methodology: value.methodology }
    ).adapter[chain],
    start: value.start,
  };
  return acc;
}, {} as SimpleAdapter);

export default adapters;
