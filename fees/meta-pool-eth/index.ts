


import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const swapABI = "event Swap (address indexed user, uint256 amountIn, uint256 amountOut, uint256 fees, uint256 treasuryFees)";
const sharesToAssetsABI = "function convertToAssets (uint256 shares) external view returns (uint256)";
const unstakePool = "0xdF261F967E87B2aa44e18a22f4aCE5d7f74f03Cc"

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const unstakeLogs = await options.getLogs({
        target: unstakePool,
        eventAbi: swapABI,
        fromBlock: await options.getFromBlock(),
        toBlock: await options.getToBlock(),
        entireLog: true,
    })

    for (const log of unstakeLogs) {
        const assetsConversion = await options.api.multiCall({
            target: unstakePool,
            abi: sharesToAssetsABI,
            calls: [
                { params: [log.args.fees] },
                { params: [log.args.treasuryFees] }
            ],
            block: log.blockNumber
        })
        const totalFees = BigInt(assetsConversion[0]) + BigInt(assetsConversion[1]);
        dailyFees.addGasToken(totalFees);
        dailyRevenue.addGasToken(assetsConversion[1]);
    }
    return { dailyFees, dailyRevenue }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: "Jul-13-2023"
        },
    }
}

export default adapter