import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()

    const feeLogs = await options.getLogs({
        target: "0x6dBDB6D420c110290431E863A1A978AE53F69ebC", // ActivePool 
        eventAbi: "event FeeRecipientClaimableCollSharesIncreased(uint256 _coll, uint256 _fee)"
    })
    for (const log of feeLogs) {
        // paid in stETH
        dailyFees.add("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", log._fee);
    }

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2024-03-15",
        }
    },
    methodology: {
        Fees: "Fees collected from protocol borrower operations.",
        Revenue: "All fees collected by the protocol.",
    }
}

export default adapter;