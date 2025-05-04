import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.BITGERT]: { factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f'},
  [CHAIN.CORE]: { factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f'},
});
