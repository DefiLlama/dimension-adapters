import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ALGEBRA_INTEGRAL_LABELS, getAlgebraIntegralFetch } from "../../helpers/algebraIntegral";

// Algebra Integral 1.2 pools: each Swap logs the overrideFee the pool plugin charged
const fetch = getAlgebraIntegralFetch({
  factory: "0x7d53327D78EFD0b463bd8d7dc938C52402323b95",
  fromBlock: 786501,
  swapFees: "inSwap",
  omitHoldersRevenue: true,
});

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BERACHAIN],
  start: "2025-02-06",
  methodology: {
    Volume: "Value swapped across the Wasabee (Algebra Integral) pools created by its factory on Berachain, counting one side of each trade.",
    Fees: "Swap fees paid by traders, at the fee each swap was charged: the override fee the pool plugin logs with the swap, or the pool fee when no override is set.",
    UserFees: "Swap fees paid by traders.",
    Revenue: "The community fee share of swap fees, read per pool on-chain (10% on every pool today), minus Algebra's cut taken by the community vault.",
    ProtocolRevenue: "The community fee share of swap fees after Algebra's cut, paid to the Safe set as fee receiver in the Wasabee community vault.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, plus Algebra's licensing cut of the community fee (20% of it today).",
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
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees forwarded to the Wasabee fee receiver Safe.",
    },
    ProtocolRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees forwarded to the Wasabee fee receiver Safe.",
    },
  },
};

export default adapter;
