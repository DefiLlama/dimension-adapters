import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";


export default uniV3Exports({
  [CHAIN.POLYGON_ZKEVM]: { factory: "0xde474db1fa59898bc91314328d29507acd0d593c", revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
});