import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const methodology = {
    Fees: "A linearly decaying fee starting at 5% is charged on withdrawals made within 30 days of deposit.",
    Revenue: "All early withdrawal fees are collected by the protocol."
}

const stakeWithdrawABI = "event StakeWithdrawn(address indexed user, uint256 amount, uint256 fee)";

const fetch = async (options: FetchOptions) => {

    const dailyFees = options.createBalances();
    const withdrawLogs = await options.getLogs({
        target: "0xE576638a9f2AD99EE9dD6F4AcBb83217566D8e18",
        eventAbi: stakeWithdrawABI,
        fromBlock: await options.getFromBlock(),
        toBlock: await options.getToBlock(),
        onlyArgs: true,
    })

    for (const log of withdrawLogs) {
        dailyFees._add("0x590830dFDf9A3F68aFCDdE2694773dEBDF267774", log.fee)
    }

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetch,
            start: "4-14-25",
        }
    },
    methodology: methodology,
}

export default adapter 
