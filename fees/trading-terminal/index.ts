import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, fetch } from "../padre";

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA, CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE],
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  start: '2025-10-24',
  isExpensiveAdapter: true,
  breakdownMethodology,
  methodology: {
    Fees: "Trading fees paid by users while using Pump Trading Terminal(previously known as Padre).",
    Revenue: "Trading terminal fees retained by Pump.fun after cashback/referral payouts and buyback/burn allocations.",
    ProtocolRevenue: "Trading terminal fees retained by Pump.fun after cashback/referral payouts and buyback/burn allocations.",
    SupplySideRevenue: "All outbound transfers from the cashback/referral wallet.",
  },
};

export default adapter;
