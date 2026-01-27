import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const adapters: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: async ({ createBalances, getLogs }: FetchOptions) => {
                const dailyFees = createBalances()
                    const logs = await getLogs({ target: "0x00000000000E1A99dDDd5610111884278BDBda1D",
                        eventAbi: 'event Bid(bytes32 from, uint256 amount, bytes32 name)' })
                    logs.forEach((i: any) => dailyFees.add(ADDRESSES.null, i.amount))
        
                return { dailyFees, dailyRevenue: dailyFees }
            },
            start: '2024-02-01',
        },
    },
    version: 2,
    methodology: {
        Fees: "Buy, registation fees paid by users.",
        Revenue: "Buy, registation fees paid by users.",
    }
}
export default adapters;