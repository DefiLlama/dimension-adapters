import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchRhivaTotals } from "../../dexs/rhiva";

const LABEL = {
  SwapFees: "Swap Fees",
  SwapFeesToProtocol: "Swap Fees To Protocol",
  ReferralFees: "Referral Fees To Referrers",
};

const fetch = async (options: FetchOptions) => {
  const { protocolFees, userFees } = await fetchRhivaTotals(options);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const { mint, amount } of protocolFees) {
    dailyFees.add(mint, amount, LABEL.SwapFees);
    dailyRevenue.add(mint, amount, LABEL.SwapFeesToProtocol);
  }
  for (const { mint, amount } of userFees) {
    dailyFees.add(mint, amount, LABEL.SwapFees);
    dailySupplySideRevenue.add(mint, amount, LABEL.ReferralFees);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SwapFees]: "Fees Rhiva's zap program charges on the SOL side of each swap, including the referrers' share.",
  },
  SupplySideRevenue: {
    [LABEL.ReferralFees]: "The share of the swap fees paid to the referrers set on the swap.",
  },
  Revenue: {
    [LABEL.SwapFeesToProtocol]: "The share of the swap fees paid to Rhiva's fee vault.",
  },
  ProtocolRevenue: {
    [LABEL.SwapFeesToProtocol]: "The share of the swap fees paid to Rhiva's fee vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-10",
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Fees users pay on the swaps Rhiva's zap program makes, charged on the SOL side of each swap.",
    SupplySideRevenue: "The share of the swap fees paid to the referrers set on the swap.",
    Revenue: "The share of the swap fees Rhiva keeps, paid to its fee vault.",
    ProtocolRevenue: "The share of the swap fees Rhiva keeps, paid to its fee vault.",
  },
  breakdownMethodology,
};

export default adapter;
