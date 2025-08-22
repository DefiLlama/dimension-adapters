import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';

const methodology = {
  UserFees: "Users pay trade fees on each swap.",
  ProtocolRevenue: "Protocol receives some % of trade fees.",
  SupplySideRevenue: "User fees minus Protocol fees.",
  HoldersRevenue: "ELITE Holders benefit from Protocol Revenue."
}


const adapters: SimpleAdapter = uniV3Exports({
  [CHAIN.FANTOM]: { factory: poolFactoryAddress, },
  [CHAIN.ARBITRUM]: { factory: poolFactoryAddress, },
  [CHAIN.BASE]: { factory: poolFactoryAddress, },
  //[CHAIN.XDAI]: { factory: poolFactoryAddress, },
  //[CHAIN.BSC]: { factory: poolFactoryAddress, },
  [CHAIN.SONIC]: { factory: poolFactoryAddress, },
})

adapters.methodology = methodology
export default adapters;
