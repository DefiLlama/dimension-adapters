import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import coreAssets from "../helpers/coreAssets.json";
import { queryDune } from "../helpers/dune";
import { addTokensReceived } from '../helpers/token';

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
    const dailyFees = options.createBalances();
    const value = (await queryDune("3986808", {
        start: options.startTimestamp,
        end: options.endTimestamp,
        receiver: '23vEM5NAmK68uBHFM52nfNtZn7CgpHDSmAGWebsjg5ft',
        token_mint_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    }));
    dailyFees.add('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', value[0].received*1e6);
    return {
        dailyFees,
        dailyRevenue: dailyFees,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.POLYGON].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: eth,
            start: 0,
        }
    }), {
        [CHAIN.SOLANA]: {
            fetch: sol,
            start: 0
        }
    }),
    isExpensiveAdapter: true
}

export default adapter;