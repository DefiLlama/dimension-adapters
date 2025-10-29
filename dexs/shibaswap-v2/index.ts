import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap"

export default uniV3Exports({
    [CHAIN.ETHEREUM]: {
        factory: '0xD9CE49caf7299DaF18ffFcB2b84a44fD33412509',
        start: "10-24-2024",
        userFeesRatio: 1,
        revenueRatio: 0,
    },
    [CHAIN.SHIBARIUM]: {
        factory: '0x2996B636663ddeBaE28742368ed47b57539C9600',
        start: "10-24-2024",
        userFeesRatio: 1,
        revenueRatio: 0,
    },
})