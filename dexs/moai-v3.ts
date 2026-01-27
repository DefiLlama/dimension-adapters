import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({ 
  [CHAIN.XRPL_EVM]: {
    factory: '0x678100B9095848FCD4AE6C79A7D29c11815D07fe',
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  }
})
