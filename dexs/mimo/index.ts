import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// Source: https://docs.mimo.finance/mimo-v2/smart-contracts
const MIMO_V2_FACTORY = "0xda257cBe968202Dea212bBB65aB49f174Da58b9D";

// Source: https://docs.mimo.finance/faq#what-are-the-trading-fees
const fetch = getUniV2LogAdapter({
  factory: MIMO_V2_FACTORY,
  fees: 0.003,
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
  allowReadPairs: true,
});

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.IOTEX]: {
      fetch,
      start: '2021-06-22'
    }
  },
  methodology: {
    UserFees: "Users pay 0.30% fees on each swap.",
    Fees: "Swap fees paid by users.",
    Revenue: "Mimo Exchange does not collect protocol revenue.",
    ProtocolRevenue: "Mimo Exchange does not collect protocol revenue.",
    SupplySideRevenue: "Swap fees are distributed to liquidity providers.",
    HoldersRevenue: "Mimo Exchange does not distribute swap fees to token holders.",
  },
  breakdownMethodology: {
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    SupplySideRevenue: "Swap fees distributed to liquidity providers.",
    Revenue: "No protocol revenue is collected from swap fees.",
    ProtocolRevenue: "No protocol revenue is collected from swap fees.",
    HoldersRevenue: "No swap fees are distributed to token holders.",
  },
};

export default adapter;
