import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ALGEBRA_INTEGRAL_LABELS, getAlgebraIntegralFetch } from "../../helpers/algebraIntegral";

// Algebra Integral 1.2.2+ pools: a SwapFee event before each Swap logs the overrideFee the pool plugin charged
const fetch = getAlgebraIntegralFetch({
  factory: "0x10253594A832f967994b44f33411940533302ACb",
  fromBlock: 35520610,
  swapFees: "swapFeeEvent",
  omitHoldersRevenue: true,
});

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2025-11-19",
  methodology: {
    Volume: "Value swapped across the Atlantis DEX (Algebra Integral) pools created by its factory on Monad, counting one side of each trade. Pools launched through third-party custom deployers are not included.",
    Fees: "Swap fees paid by traders, at the fee each swap was charged: the override fee the pool plugin logs with the swap, or the pool fee when no override is set.",
    UserFees: "Swap fees paid by traders.",
    Revenue: "The community fee share of swap fees, read per pool on-chain (10% on every pool today), minus Algebra's cut taken by the community vault.",
    ProtocolRevenue: "The community fee share of swap fees after Algebra's cut, which accrues in the Atlantis community vault for the fee receiver set there.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, plus Algebra's licensing cut of the community fee (30% of it today).",
  },
  breakdownMethodology: {
    Fees: {
      [ALGEBRA_INTEGRAL_LABELS.SWAP_FEES]: "Every swap fee charged, at the rate the trade actually paid.",
    },
    SupplySideRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.LP_FEES]: "The part of swap fees that stays in the pool for liquidity providers.",
      [ALGEBRA_INTEGRAL_LABELS.ALGEBRA_FEES]: "Algebra's licensing cut, taken by the community vault from the fees pools send it.",
    },
    Revenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees, after Algebra's cut, accruing in the Atlantis community vault.",
    },
    ProtocolRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees, after Algebra's cut, accruing in the Atlantis community vault.",
    },
  },
};

export default adapter;
