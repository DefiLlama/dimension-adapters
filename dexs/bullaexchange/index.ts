import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ALGEBRA_INTEGRAL_LABELS, getAlgebraIntegralFetch } from "../../helpers/algebraIntegral";

const fetch = getAlgebraIntegralFetch({
  factory: "0x79164EA9C1AA75d19DDFc71eBEAEA8092D1e71CE",
  fromBlock: 782756,
  directVaults: ["0x8Ec9F5d1d44b49431ddbdAEd9bad2dAbD4920f37"],
});

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BERACHAIN],
  start: "2025-02-06",
  methodology: {
    Volume: "Value swapped across Bulla Exchange pools, counting one side of each trade.",
    Fees: "Swap fees paid by traders, at the rate each swap was charged. Pools run Algebra's dynamic fee, so the rate is tracked through every on-chain fee change.",
    UserFees: "Swap fees paid by traders.",
    Revenue: "The community fee share of swap fees (25% on most pools, set per pool on-chain) that reaches Bulla's treasury Safe, after Algebra's cut.",
    ProtocolRevenue: "The community fee share of swap fees that reaches Bulla's treasury Safe, after Algebra's cut.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, plus Algebra's 1.5% licensing cut of the community fee.",
    HoldersRevenue: "No swap fees go to token holders.",
  },
  breakdownMethodology: {
    Fees: {
      [ALGEBRA_INTEGRAL_LABELS.SWAP_FEES]: "Every swap fee charged, at the rate the trade actually paid.",
    },
    SupplySideRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.LP_FEES]: "The part of swap fees that stays in the pool for liquidity providers.",
      [ALGEBRA_INTEGRAL_LABELS.ALGEBRA_FEES]: "Algebra's 1.5% licensing cut, taken by the community vault from the fees pools send it.",
    },
    Revenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees forwarded to Bulla's treasury Safe.",
    },
    ProtocolRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees forwarded to Bulla's treasury Safe.",
    },
  },
};

export default adapter;
