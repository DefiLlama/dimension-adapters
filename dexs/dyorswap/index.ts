import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.PLASMA]: {
    factory: '0xA9F2c3E18E22F19E6c2ceF49A88c79bcE5b482Ac',
    start: 1871833,
    fees: 0.003,  // 0.30%
  },
});
