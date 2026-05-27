import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  fetchOriginFees,
  OriginProduct,
  ORIGIN_YIELD_LABEL,
  ORIGIN_PROTOCOL_FEE_LABEL,
  ORIGIN_REBASE_LABEL,
  STAKING_REWARDS_LABEL,
} from "../helpers/origin-protocol";

// Origin Sonic (OS) currently has trusteeFeeBps = 1000 (10%) on-chain —
// half the rate of OUSD/OETH/superOETHb (2000 = 20%). The helper reads each
// vault's rate at the historical block so this stays correct if it changes.
const PRODUCTS: OriginProduct[] = [
  { apiKey: "os", vault: "0xa3c0eCA00D2B76b4d1F170b0AB3FdeA16C180186", feeAbi: "uint256:trusteeFeeBps" },
];

const methodology = {
  Fees: "Yield earned by Origin Sonic (OS) vault strategies before Origin's performance fee.",
  Revenue: "OS yield × trusteeFeeBps read on-chain from the OS vault (currently 10%).",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Yield (net of performance fee) received by OS holders via rebase.",
};

const breakdownMethodology = {
  Fees: {
    [ORIGIN_YIELD_LABEL]: "Daily OS yield as published by Origin's daily_revenue API, before performance fee.",
  },
  Revenue: {
    [ORIGIN_PROTOCOL_FEE_LABEL]: "OS yield × on-chain trusteeFeeBps from the OS vault (currently 10%).",
  },
  HoldersRevenue: {
    [STAKING_REWARDS_LABEL]: "Performance fee forwarded to OGN stakers.",
  },
  SupplySideRevenue: {
    [ORIGIN_REBASE_LABEL]: "Yield net of performance fee, distributed to OS holders via rebase.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  // Origin's daily_revenue API can report negative amountUSD on loss days; the
  // helper now forwards those through instead of dropping them. See
  // helpers/origin-protocol.ts.
  allowNegativeValue: true,
  fetch: fetchOriginFees(PRODUCTS),
  chains: [CHAIN.SONIC],
  start: '2024-12-17',
  methodology,
  breakdownMethodology,
};

export default adapter;
