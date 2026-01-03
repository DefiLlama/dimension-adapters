import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({
        [CHAIN.HYPERLIQUID]: {
                factory: '0x1Cd8363DfAdA19911f745BA984fce02b42c943bF',
                revenueRatio: 0.143,
                protocolRevenueRatio: 0.143,
        },
})
