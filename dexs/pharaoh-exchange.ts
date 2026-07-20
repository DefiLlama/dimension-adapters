import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";
import { PHARAOH_METRIC } from "./pharaoh-v2";

const v2Endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('NFHumrUD9wtBRnZnrvkQksZzKpic26uMM5RbZR56Gns'),
};

const v2Graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 100,
    UserFees: 100,
    Revenue: 100,
    SupplySideRevenue: 0,
    ProtocolRevenue: 8,
  },
});

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const results: any = await v2Graphs(options);

  dailyVolume.addUSDValue(results.dailyVolume);
  
  dailyFees.addUSDValue(results.dailyFees, PHARAOH_METRIC.SwapFees);

  dailyRevenue.addUSDValue(Number(results.dailyFees) * 0.92, PHARAOH_METRIC.SwapFeesToVoters);
  dailyHoldersRevenue.addUSDValue(Number(results.dailyFees) * 0.92, PHARAOH_METRIC.SwapFeesToVoters);

  dailyRevenue.addUSDValue(Number(results.dailyFees) * 0.08, PHARAOH_METRIC.SwapFeesToTreasury);
  dailyProtocolRevenue.addUSDValue(Number(results.dailyFees) * 0.08, PHARAOH_METRIC.SwapFeesToTreasury);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Fees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  Revenue: "Revenue going to the protocol and holders.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "No fees shared to LPs.",
};

const adapter: SimpleAdapter = {
  version: 2,
  start: '2023-12-12',
  chains: [CHAIN.AVAX],
  fetch: fetch,
  methodology,
  breakdownMethodology: {
    Fees: {
      [PHARAOH_METRIC.SwapFees]: "Swap fees paid by traders.",
    },
    Revenue: {
      [PHARAOH_METRIC.SwapFeesToTreasury]: "Swap fees shared to treasury.",
      [PHARAOH_METRIC.SwapFeesToVoters]: "Swap fees shared to xPHAR voters.",
    },
    UserFees: {
      [PHARAOH_METRIC.SwapFees]: "Swap fees paid by traders.",
    },
    ProtocolRevenue: {
      [PHARAOH_METRIC.SwapFeesToTreasury]: "Swap fees shared to treasury.",
    },
    HoldersRevenue: {
      [PHARAOH_METRIC.SwapFeesToVoters]: "Swap fees shared to xPHAR voters.",
    },
  }
};

export default adapter;
