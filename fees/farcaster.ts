import { Dependencies,SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens } from "../helpers/token";

const LABEL = 'SoFi Service Fees';

const chainConfig: Record<string, { target: string, tokens: string[], start: string }> = {
    [CHAIN.OPTIMISM]: {
        target: '0x00000000fcce7f938e7ae6d3c335bd6a1a7c593d',
        tokens: [],
        start: '2024-01-02',
    },
    [CHAIN.BASE]: {
        target: '0xbc698ce1933afb2980d4a5a0f85fea1b02fbb1c9',
        tokens: [],
        start: '2024-01-02',
    }
}

const fetch = async (options: FetchOptions) => {  
  const { dailyFees } = await evmReceivedGasAndTokens(chainConfig[options.chain].target, chainConfig[options.chain].tokens)(options)
  return {
    dailyFees: dailyFees.clone(1, LABEL),
    dailyRevenue: dailyFees.clone(1, LABEL),
  }
}

const methodology = {
    Fees: 'Service fees paid by users on Farcaster SoFi actions, received by the protocol.',
    Revenue: 'All SoFi service fees are collected by the protocol as revenue.',
}

const breakdownMethodology = {
    Fees: {
        [LABEL]: 'Service fees paid by users on Farcaster SoFi actions.',
    },
    Revenue: {
        [LABEL]: 'All SoFi service fees are collected by the protocol as revenue.',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: Object.keys(chainConfig) as CHAIN[],
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
    methodology,
    breakdownMethodology,
}

export default adapter;