import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: any = async ({ createBalances, getLogs }: FetchOptions) => {
    const dailyFees = createBalances()
    const airdrop_logs = await getLogs({ topics: ["0x1dcd2362ae467d43bf31cbcac0526c0958b23eb063e011ab49a5179c839ed9a9"], noTarget: true })
    const stream_logs = await getLogs({ topics: ["0x1a7b0d6c8f96b874563b711cf97793fe3be5dc42dbd1e0720ce40f326918e817"], noTarget: true })
    const lockup_logs = await getLogs({ topics: ["0x40b88e5c41c5a97ffb7b6ef88a0a2d505aa0c634cf8a0275cb236ea7dd87ed4d"], noTarget: true })
    dailyFees.addUSDValue(airdrop_logs.length * 3 + stream_logs.length + lockup_logs.length)

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: [CHAIN.ETHEREUM, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.BASE].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: fetch,
        },
    }), {}),
    methodology: {
        Fees: 'Fees paid by users for using Sablier services.',
        Revenue: 'Fees portion collected by Sablier.',
    }
};

export default adapter;
