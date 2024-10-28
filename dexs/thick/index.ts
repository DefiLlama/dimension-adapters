import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';

const methodology = {
  UserFees: "Users pay trade fees on each swap.",
  ProtocolRevenue: "Protocol receives some % of trade fees.",
  SupplySideRevenue: "User fees minus Protocol fees.",
  HoldersRevenue: "Holders benefit from buyback using Protocol fees."
}


const adapters: SimpleAdapter = uniV3Exports({
  [CHAIN.FANTOM]: { factory: poolFactoryAddress, },
  [CHAIN.ARBITRUM]: { factory: poolFactoryAddress, },
  [CHAIN.BASE]: { factory: poolFactoryAddress, },
})


Object.keys(adapters.adapter).forEach((chain: any) => {
  adapters.adapter[chain].meta = { methodology }
})
export default adapters;
