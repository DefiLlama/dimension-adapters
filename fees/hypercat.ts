import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ALGEBRA_INTEGRAL_LABELS, getAlgebraIntegralFetch } from "../helpers/algebraIntegral";

const fetch = getAlgebraIntegralFetch({
  factory: "0x1d9DcF8238daf2E078FF639a5Ded6b518BF3E585",
  fromBlock: 4548782,
});

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-05-31",
  methodology: {
    Fees: "Swap fees paid by traders, at the rate each swap was charged. Pools run Algebra's dynamic fee, so the rate is tracked through every on-chain fee change.",
    UserFees: "Swap fees paid by traders.",
    Revenue: "The 25% community fee share of swap fees that reaches the HyperCat fee receiver, after Algebra's cut.",
    ProtocolRevenue: "The 25% community fee share of swap fees that reaches the HyperCat fee receiver, after Algebra's cut.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, plus Algebra's 5% licensing cut of the community fee.",
    HoldersRevenue: "No swap fees go to token holders.",
  },
  breakdownMethodology: {
    Fees: {
      [ALGEBRA_INTEGRAL_LABELS.SWAP_FEES]: "Every swap fee charged, at the rate the trade actually paid.",
    },
    SupplySideRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.LP_FEES]: "The part of swap fees that stays in the pool for liquidity providers.",
      [ALGEBRA_INTEGRAL_LABELS.ALGEBRA_FEES]: "Algebra's 5% licensing cut, taken by the community vault from the fees pools send it.",
    },
    Revenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees forwarded to HyperCat's fee receiver, the factory owner.",
    },
    ProtocolRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees forwarded to HyperCat's fee receiver, the factory owner.",
    },
  },
};

export default adapter;
