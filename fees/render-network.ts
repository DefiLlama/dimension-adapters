import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

// Render Network — Burn-Mint Equilibrium (BME) fee tracking on Solana.
//
// Render is a decentralized GPU compute network. Under the BME model
// (RNP-001), each render job is priced in USD; an equivalent USD value
// of RENDER is burned, and node operators receive new RENDER emitted on
// epoch boundaries. Per the Foundation's documented fee schedule, a
// 5% Network Operator service fee is paid to OTOY (the infrastructure
// maintainer) per job. That 5% is taken before the burn and is paid
// off-chain, so on-chain we observe only the 95% node-operator side.
//
//   gross job spend (user-paid) = on-chain burn / 0.95
//
// References:
//   - RNP-001 (Burn-Mint Equilibrium): https://github.com/rendernetwork/RNPs/blob/main/RNP-001.md
//   - Burn-Mint Equilibrium overview:  https://know.rendernetwork.com/basics/burn-mint-equilibrium
//   - RNDR → RENDER (Solana) FAQ:      https://know.rendernetwork.com/general-render-network/rndr-to-render-what-you-need-to-know
//
// Bucket mapping (per GUIDELINES.md, gross-up):
//   dailyFees              = burn_USD * (100/95)   // gross user payment
//   dailySupplySideRevenue = burn_USD              // 95% emission to node operators (BME)
//   dailyProtocolRevenue   = burn_USD * (5/95)     // 5% OTOY service fee
//   dailyRevenue           = dailyProtocolRevenue  // dailyFees - dailySupplySideRevenue
//
// Scope: RENDER SPL on Solana only (mint rndrizKT...EkHBof, 8 decimals).
// The legacy Ethereum RNDR ERC-20 (pre-2023-11-02) is out of scope; its
// holders swapped 1:1 to the Solana mint via the Foundation portal.

const RENDER_CG_ID = "render-token";

const LABEL = {
  BMEJobBurn:           "BME Job Burn",
  NodeOperatorEmission: "BME Node Operator Emission",
  OTOYServiceFee:       "OTOY Network Operator Service Fee",
} as const;

interface DailyBurn {
  render_burned: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const query = getSqlFromFile("helpers/queries/render-network.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const data: DailyBurn[] = await queryDuneSql(options, query);

  const burnRender = Number(data[0]?.render_burned || 0);
  if (burnRender > 0) {
    // Gross user-paid value: on-chain burn is the 95% node-operator side.
    dailyFees.addCGToken(RENDER_CG_ID, burnRender * (100 / 95), LABEL.BMEJobBurn);
    // 95% goes to node operators via mints in long-run BME equilibrium.
    dailySupplySideRevenue.addCGToken(RENDER_CG_ID, burnRender, LABEL.NodeOperatorEmission);
    // 5% Network Operator service fee paid to OTOY.
    dailyProtocolRevenue.addCGToken(RENDER_CG_ID, burnRender * (5 / 95), LABEL.OTOYServiceFee);
    dailyRevenue.addCGToken(RENDER_CG_ID, burnRender * (5 / 95), LABEL.OTOYServiceFee);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees:
    "Gross user-paid spend on render jobs under the Burn-Mint Equilibrium model " +
    "(RNP-001). Each job is priced in USD; an equivalent USD value of RENDER is " +
    "burned on the Solana SPL mint. The on-chain burn represents the 95% " +
    "node-operator side of gross job spend; gross fees are derived by dividing " +
    "the burn value by 0.95. The remaining 5% Network Operator service fee is " +
    "paid to OTOY off-chain per the Foundation's documented fee schedule and is " +
    "not directly observed in the on-chain burn stream. Legacy Ethereum RNDR " +
    "(pre-2023-11-02 Solana migration) is out of scope.",
  Revenue:
    "Documented 5% Network Operator service fee paid to OTOY per RNP-001 / " +
    "Foundation governance. Derived from the on-chain burn as burn × (5/95).",
  ProtocolRevenue:
    "Same as Revenue — 5% OTOY service fee.",
  SupplySideRevenue:
    "RENDER tokens emitted to node operators per the BME schedule. In long-run " +
    "equilibrium this equals the burned amount (95% of gross job spend). Mints " +
    "are batched at epoch boundaries and reported here daily on a burn-equivalent " +
    "basis.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.BMEJobBurn]:
      "Gross USD value of render jobs paid by users (burn × 100/95).",
  },
  Revenue: {
    [LABEL.OTOYServiceFee]:
      "5% Network Operator service fee retained by OTOY for infrastructure maintenance.",
  },
  ProtocolRevenue: {
    [LABEL.OTOYServiceFee]:
      "5% Network Operator service fee retained by OTOY for infrastructure maintenance.",
  },
  SupplySideRevenue: {
    [LABEL.NodeOperatorEmission]:
      "RENDER emitted to node operators under the BME schedule (95% of gross job spend in equilibrium).",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2023-11-02", // RENDER SPL launch / RNDR→RENDER 1:1 swap go-live
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;
