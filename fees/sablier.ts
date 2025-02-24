import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: any = async ({ createBalances, getLogs }: FetchOptions) => {
    const dailyFees = createBalances()
    const airdrop_logs = await getLogs({ topics: ["0x1dcd2362ae467d43bf31cbcac0526c0958b23eb063e011ab49a5179c839ed9a9"] })
    const stream_logs = await getLogs({ topics: ["0x1a7b0d6c8f96b874563b711cf97793fe3be5dc42dbd1e0720ce40f326918e817"] })
    dailyFees.addUSDValue(airdrop_logs.length * 3 + stream_logs.length)

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: [CHAIN.ETHEREUM, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.BASE].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: fetch,
        },
    }), {})
};

export default adapter;
