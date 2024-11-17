import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import coreAssets from "../helpers/coreAssets.json";
import { addTokensReceived, getSolanaReceived } from '../helpers/token';

const USDC = {
    ethereum: coreAssets.ethereum.USDC,
    polygon: coreAssets.polygon.USDC_CIRCLE,
    base: coreAssets.base.USDC,
} as any

const eth = async (options: FetchOptions) => {
    const dailyFees = await addTokensReceived({ options, tokens: [USDC[options.chain]], target: '0xbf07aFF5114BAd83720A8b9Fc7585aFd2ef9E4C2' })
    return {
        dailyFees,
        dailyRevenue: dailyFees,
    }
}

// TODO: check whether 5qR17nnyyBjoHPiGiAD4ZHFCSJixebJCYymArGgZiDnh was an older address where they received payments
const sol = async (options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({ options, targets: ['23vEM5NAmK68uBHFM52nfNtZn7CgpHDSmAGWebsjg5ft', 'AJENSD55ZJBwipZnEf7UzW2pjxex1cV2jSKPz7aMwJo5'] })
    return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: Adapter = {
    version: 2,
    adapter: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.POLYGON].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: eth,
                    }
    }), {
        [CHAIN.SOLANA]: {
            fetch: sol,
        }
    }),
    isExpensiveAdapter: true
}

export default adapter;
