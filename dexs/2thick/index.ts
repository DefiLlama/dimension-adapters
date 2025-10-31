import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

const poolFactoryAddress = '0x7Ca1dCCFB4f49564b8f13E18a67747fd428F1C40';

const methodology = {
  UserFees: "Users pay trade fees on each swap.",
  ProtocolRevenue: "Protocol receives some % of trade fees.",
  SupplySideRevenue: "User fees minus Protocol fees.",
  HoldersRevenue: "ELITE Holders benefit from Protocol Revenue."
}


const adapters: SimpleAdapter = uniV3Exports({
  [CHAIN.FANTOM]: { factory: poolFactoryAddress, },
  [CHAIN.BASE]: { factory: poolFactoryAddress, },
  //[CHAIN.BSC]: { factory: "0x5C0a9661E0bC1294bB87686C472F7C699831B1ea", }, //different
  [CHAIN.SONIC]: { factory: poolFactoryAddress, },
})
adapters.methodology = methodology;

export default adapters;
