import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { uniV2Exports } from "../helpers/uniswap";

const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';

const methodology = {
  UserFees: "Users pay a Trading fee on each swap, including Flash Loans.",
  Fees: "Net Trading fees paid by all ABcDeFx users.",
  Revenue: "100% of the trading fee is collected by Protocol.",
  ProtocolRevenue: "100% of the trading fee is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Trade Fees is used to buyback ELITE.",
  SupplySideRevenue: "0% of trading fees are distributed among liquidity providers."
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees charged on all token swaps, including Flash Loans"
  }
};

const adapters: SimpleAdapter = uniV2Exports({
  [CHAIN.FANTOM]: { factory: FACTORY_ADDRESS, },
  [CHAIN.KCC]: { factory: FACTORY_ADDRESS, },
  [CHAIN.KAVA]: { factory: FACTORY_ADDRESS, },
})

adapters.methodology = methodology;
adapters.breakdownMethodology = breakdownMethodology;
export default adapters;