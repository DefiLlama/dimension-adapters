import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addTokensReceived } from '../../helpers/token';

const getFees = async (options): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances()

    await addTokensReceived({ options, tokens: [ADDRESSES.blast.WETH], target: "0x8ab15fe88a00b03724ac91ee4ee1f998064f2e31", balances: dailyFees })
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.BLAST]: {
            fetch: getFees,
            start: '2024-04-30',
        },
    },
    methodology: {
        Fees: "All card trading fees paid by users while using Fantasy.",
        Revenue: "Trading fees are collected by Fantasy protocol.",
        ProtocolRevenue: "Trading fees are collected by Fantasy protocol.",
    }
};
export default adapter;
