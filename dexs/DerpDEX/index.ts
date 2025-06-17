import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap"

export default uniV3Exports({
    [CHAIN.ERA]: { factory: '0x52a1865eb6903bc777a02ae93159105015ca1517', },
    [CHAIN.BASE]: { factory: '0xeddef4273518b137cdbcb3a7fa1c6a688303dfe2', },
    // [CHAIN.OP_BNB]: { factory: '0xb91331Ea9539ee881e3A45191076c454E482dAc7', },
})
