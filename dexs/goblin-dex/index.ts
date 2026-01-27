import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap"

export default uniV3Exports({
  [CHAIN.SMARTBCH]: { factory: '0x08153648C209644a68ED4DC0aC06795F6563D17b', },
  [CHAIN.BSC]: { factory: '0x30D9e1f894FBc7d2227Dd2a017F955d5586b1e14', },
  [CHAIN.BASE]: { factory: '0xE82Fa4d4Ff25bad8B07c4d1ebd50e83180DD5eB8', },
})
