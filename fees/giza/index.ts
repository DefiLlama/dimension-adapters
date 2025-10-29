import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const Staking = '0xE576638a9f2AD99EE9dD6F4AcBb83217566D8e18'
const GIZA = '0x590830dFDf9A3F68aFCDdE2694773dEBDF267774'
const StakeWithdrawnEvent = "event StakeWithdrawn(address indexed user, uint256 amount, uint256 fee)"

const fetch = async (options: FetchOptions) => {

    const dailyFees = options.createBalances();
    const withdrawLogs = await options.getLogs({
        target: Staking,
        eventAbi: StakeWithdrawnEvent,
    })

    for (const log of withdrawLogs) {
        dailyFees.add(GIZA, log.fee)
    }

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.BASE],
    start: "2025-04-14",
    methodology: {
        Fees: "A linearly decaying fee starting at 5% is charged on withdrawals made within 30 days of deposit.",
        Revenue: "All early withdrawal fees are collected by the protocol."
    },
}

export default adapter 
