import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

// EulerSwapFactory
const config = {
    [CHAIN.ETHEREUM]: '0xb013be1D0D380C13B58e889f412895970A2Cf228',
    [CHAIN.UNICHAIN]: '0x45b146bc07c9985589b52df651310e75c6be066a'
}

const prefetch = async (options: FetchOptions) => {
    const sql = getSqlFromFile('helpers/queries/eulerswap.sql', {
        start: options.startTimestamp,
        end: options.endTimestamp
    });
    return await queryDuneSql(options, sql);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const results = options.preFetchedResults || [];
    const chainData = results.find(item => item.chain === options.chain.toLowerCase());

    if (!chainData) {
        return {
            dailyVolume: 0,
            dailyFees: 0,
            dailyRevenue: 0,
            dailyProtocolRevenue: 0,
            dailySupplySideRevenue: 0
        }
    }

    const dailyVolume = chainData.volume || 0;
    const dailyFees = chainData.dailyProtocolFees + chainData.dailySupplySideRevenue;
    const dailyProtocolRevenue = chainData.dailyProtocolFees;
    const dailySupplySideRevenue = chainData.dailySupplySideRevenue;

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    }
}

const methodology = {
    Fees: 'Swap fee paid by users.',
    Revenue: 'Fees collected by the protocol.',
    ProtocolRevenue: 'Fees collected by the protocol.',
    SupplySideRevenue: 'Liquidity providers revenue.',
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.UNICHAIN, CHAIN.BSC],
    start: '2025-06-05',
    methodology,
    prefetch,
    doublecounted: true,
    isExpensiveAdapter: true
}

export default adapter;