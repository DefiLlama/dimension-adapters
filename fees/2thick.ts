import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';

const methodology = {
  UserFees: "Traders using 2Thick Liquidiy pay a Trading fee on each swap. Includes Flash Loan Fees.",
  Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
  Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
  ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
  SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees paid by users on each swap (variable rate set per pool), plus any flash loan fees charged when users borrow assets temporarily within a single transaction"
  }
}

const adapters: SimpleAdapter = uniV3Exports({
  [CHAIN.FANTOM]: { factory: poolFactoryAddress, },
  //[CHAIN.BSC]: { factory: "0x5C0a9661E0bC1294bB87686C472F7C699831B1ea", }, //different
  [CHAIN.BASE]: { factory: poolFactoryAddress, },
  [CHAIN.SONIC]: { factory: poolFactoryAddress, },
})

adapters.methodology = methodology;
adapters.breakdownMethodology = breakdownMethodology;
export default adapters;

