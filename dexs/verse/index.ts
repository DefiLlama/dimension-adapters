import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

export default uniV2Exports({
    [CHAIN.ETHEREUM]: { factory: '0xee3E9E46E34a27dC755a63e2849C9913Ee1A06E2', },
    [CHAIN.SMARTBCH]: { factory: '0x16bc2B187D7C7255b647830C05a6283f2B9A3AF8', },
})