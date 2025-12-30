import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

/**
 * PotatoSwap DEX (X Layer)
 *
 * Documentation:
 * https://potatoswap.gitbook.io/potatoswap
 *
 * Fee model (from docs):
 * - PotatoSwap charges swap fees on trades
 * - Classic pools apply a 0.25% swap fee
 * - "A portion of all trading fees is used to reward our Liquidity Providers,
 *    with the remainder supporting the PotatoSwap ecosystem."
 *
 * The documentation does not specify an explicit on-chain breakdown
 * for all pools in the tracked subgraph. This adapter therefore models
 * fees using a fixed split consistent with historical behavior and
 * the documented LP vs protocol fee structure.
 */

const methodology = {
  Fees:
    "PotatoSwap charges swap fees on trades. This adapter models an effective 0.25% swap fee on trading volume.",
  UserFees:
    "Users pay swap fees as part of each trade.",
  SupplySideRevenue:
    "A portion of swap fees is distributed to liquidity providers.",
  ProtocolRevenue:
    "The remaining portion of swap fees supports the PotatoSwap ecosystem.",
  HoldersRevenue:
    "Protocol revenue is distributed to vePOT holders.",
};

const graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.XLAYER]:
      "https://indexer.potatoswap.finance/subgraphs/id/Qmaeqine8JeSiKV3QCi6JJqzDGryF7D8HCJdqcYxW7nekw",
  },

  // Trading volume is sourced from the factory entity in the subgraph
  totalVolume: {
    factory: "pancakeFactories",
  },

  /**
   * Fee configuration
   *
   * Based on documentation stating that trading fees are split between
   * Liquidity Providers and the PotatoSwap ecosystem, the adapter models:
   *
   * - Total fees: 0.25% of volume
   * - Liquidity Providers: 0.21%
   * - Protocol (ecosystem): 0.04%
   *
   * This preserves historical adapter behavior while aligning with
   * the documented fee flow.
   */
  feesPercent: {
    type: "volume" as const,

    // Total swap fees paid by users
    Fees: 0.25,
    UserFees: 0.25,

    // Fee distribution
    SupplySideRevenue: 0.21,
    ProtocolRevenue: 0.04,
    HoldersRevenue: 0.04,
    Revenue: 0.04,
  },
});

export default {
  version: 2,
  methodology,
  chains: [CHAIN.XLAYER],
  fetch: graphs,
  start: "2024-04-23",
};
