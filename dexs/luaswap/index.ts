import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const ETH_FACTORY = '0x0388C1E0f210AbAe597B7DE712B9510C6C36C857'

export default uniV2Exports({
  [CHAIN.ETHEREUM]: {
    factory: ETH_FACTORY,
  },
})