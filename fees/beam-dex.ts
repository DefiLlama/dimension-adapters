import { BreakdownAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";


const v3Graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.ZETA]: 'https://subgraph.satsuma-prod.com/7d07f1edcbfd/codemelt/zeta-analytics/api'
  },
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Revenue is 100% of collected fees
  },
});

const methodology = {
  UserFees: "User pays trading fees for each swap.",
  Fees: "Fees are dynamic according to market volume.",
  Revenue: "Protocol receives a portion of swap fees",
  ProtocolRevenue: "15% of all swap fees.",
  SupplySideRevenue: "Users providing liquidity receive 85% of trading fees, or $BEAM emissions and 15% of trading fees depending on the pool.",
  HoldersRevenue: "Holders of $BEAM receive trading fees and bribes from the reward pool that they vote for each week.",
};

const breakdownMethodology = {
  UserFees: {
    'Trading fees': 'Fees paid by users on each swap transaction, with dynamic rates based on market conditions',
  },
  SupplySideRevenue: {
    'LP fees': 'All swap fees distributed to liquidity providers who supply assets to the pools',
  },
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v3: {
      [CHAIN.ZETA]: {
        fetch: v3Graphs,
        start: '2024-10-17',
      }
    }
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
