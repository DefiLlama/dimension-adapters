import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ALGEBRA_INTEGRAL_LABELS, getAlgebraIntegralFetch } from "../../helpers/algebraIntegral";

// Algebra Integral 1.2 pools: each Swap logs the overrideFee the pool plugin charged
const fetch = getAlgebraIntegralFetch({
  factory: "0xBefC4b405041c5833f53412fF997ed2f697a2f37",
  fromBlock: 391829824,
  swapFees: "inSwap",
  omitHoldersRevenue: true,
});

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-10-21",
  methodology: {
    Volume: "Value swapped across the Camelot V4 (Algebra Integral) pools created by the Camelot V4 factory on Arbitrum, counting one side of each trade. Pools launched through third-party custom deployers are not included.",
    Fees: "Swap fees paid by traders, at the fee each swap was charged: the override fee the pool plugin logs with the swap, or the pool fee when no override is set.",
    UserFees: "Swap fees paid by traders.",
    Revenue: "The community fee share of swap fees, read per pool on-chain (20% on every initialized pool today), minus Algebra's cut taken by the community vault.",
    ProtocolRevenue: "The community fee share of swap fees after Algebra's cut, which accrues in the Camelot V4 community vault for the fee receiver set there.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, plus Algebra's licensing cut of the community fee (10% of it today).",
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
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees, after Algebra's cut, accruing in the Camelot V4 community vault.",
    },
    ProtocolRevenue: {
      [ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES]: "Community fees, after Algebra's cut, accruing in the Camelot V4 community vault.",
    },
  },
};

export default adapter;
