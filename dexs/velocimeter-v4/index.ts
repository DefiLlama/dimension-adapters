import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.IOTAEVM]: { factory: '0x10A288eF87586BE54ea690998cAC82F7Cc90BC50', fees: 0.0025, voter: '0x6c9BB73106501c6E0241Fe8E141620868b3F0096' },
})
