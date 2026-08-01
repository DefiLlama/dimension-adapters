import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  fetchOriginFees,
  OriginProduct,
  ORIGIN_YIELD_LABEL,
  ORIGIN_PROTOCOL_FEE_LABEL,
  ORIGIN_REBASE_LABEL,
  STAKING_REWARDS_LABEL,
} from "../../helpers/origin-protocol";

const PRODUCTS: OriginProduct[] = [
  { apiKey: "ousd", vault: "0xE75D77B1865Ae93c7eaa3040B038D7aA7BC02F70", feeAbi: "uint256:trusteeFeeBps" },
];

const methodology = {
  Fees: "Yield earned by OUSD vault strategies (Curve, Convex, Morpho, etc.) before Origin's performance fee.",
  Revenue: "OUSD yield × trusteeFeeBps read on-chain from the OUSD vault (currently 20%).",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Yield (net of performance fee) received by OUSD holders via rebase.",
};

const breakdownMethodology = {
  Fees: {
    [ORIGIN_YIELD_LABEL]: "Daily OUSD yield as published by Origin's daily_revenue API, before performance fee.",
  },
  Revenue: {
    [ORIGIN_PROTOCOL_FEE_LABEL]: "OUSD yield × on-chain trusteeFeeBps from the OUSD vault (currently 20%).",
  },
  HoldersRevenue: {
    [STAKING_REWARDS_LABEL]: "Performance fee forwarded to OGN stakers.",
  },
  SupplySideRevenue: {
    [ORIGIN_REBASE_LABEL]: "Yield net of performance fee, distributed to OUSD holders via rebase.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  // Origin's daily_revenue API can report negative amountUSD on loss days (rare
  // for OToken vaults but possible for ARM vaults when NAV dips). The helper
  // forwards those through so dailyFees / Revenue / SupplySide reflect the
  // true daily delta instead of being inflated by silently dropping loss days.
  allowNegativeValue: true,
  fetch: fetchOriginFees(PRODUCTS),
  chains: [CHAIN.ETHEREUM],
  start: '2021-11-02',
  methodology,
  breakdownMethodology,
};

export default adapter;
