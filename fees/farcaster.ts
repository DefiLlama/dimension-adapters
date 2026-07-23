import { Dependencies,SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens } from "../helpers/token";

const chainConfig: Record<string, { target: string, tokens: string[] }> = {
    [CHAIN.OPTIMISM]: {
        target: '0x00000000fcce7f938e7ae6d3c335bd6a1a7c593d',
        tokens: [],
    },
    [CHAIN.BASE]: {
        target: '0xbc698ce1933afb2980d4a5a0f85fea1b02fbb1c9',
        tokens: [],
    }
}

const fetch = async (options: FetchOptions) => {  
    return evmReceivedGasAndTokens(chainConfig[options.chain].target, chainConfig[options.chain].tokens)(options)
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: Object.keys(chainConfig) as CHAIN[],
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
}

export default adapter;