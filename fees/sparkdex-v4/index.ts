import { CHAIN } from "../../helpers/chains";
import { Adapter } from "../../adapters/types";
import { graphDimensionFetch } from "../../helpers/getUniSubgraph";
import { METRIC } from "../../helpers/metrics";

const fetch = graphDimensionFetch({
  graphUrls: {
    [CHAIN.FLARE]: "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v4/latest/gn",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
  },
  dailyFees: {
    factory: "algebraDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    UserFees: 100, // 100% of fees are paid by users
    Fees: 100,
    SupplySideRevenue: 75, // 75% to LPs
    ProtocolRevenue: 5, // 5% to protocol
    HoldersRevenue: 20, // 20% to holders (10% buyback + 10% staking rewards)
    Revenue: 25, // 25% to protocol (5% ProtocolRevenue + 20% HoldersRevenue)
  },
});

const adapters: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: '2026-01-26',
    },
  },
  methodology: {
    Fees: "Swap fees paid by platform users.",
    UserFees: "Swap fees paid by platform users.",
    Revenue: "25% of the fees go to the protocol (5% Protocol + 20% Holders).",
    ProtocolRevenue: "5% of the fees go to the protocol.",
    HoldersRevenue: "20% of the fees go to holders (10% buyback + 10% staking rewards).",
    SupplySideRevenue: "75% of swap fees are distributed to Liquidity Providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'All Swap fees paid by platform users.',
    },
    Revenue: {
      [METRIC.SWAP_FEES]: '25% of Swap Fees are considered as revenue (5% Protocol + 20% Holders).',
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: '75% of Swap Fees distributed to Liquidity Providers.',
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: '5% of Swap Fees collected by the protocol.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: '10% of Swap Fees are used for token buybacks.',
      [METRIC.STAKING_REWARDS]: '10% of Swap Fees distributed to stakers.',
    },
  },
};

export default adapters;
