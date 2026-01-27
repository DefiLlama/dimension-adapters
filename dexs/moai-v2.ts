import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

export default uniV2Exports({ 
  [CHAIN.XRPL_EVM]: {
    factory: '0x645541A2e2fb655fd7765898DFfbc7dd051E5B67',
    revenueRatio: 0,
  }
})
