import { Adapter, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addTokensReceived } from '../../helpers/token';

const getFees = async (options): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances()

    await addTokensReceived({ options, tokens: ["0x4300000000000000000000000000000000000004"], target: "0x8ab15fe88a00b03724ac91ee4ee1f998064f2e31", balances: dailyFees })
    return {
        dailyFees,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.BLAST]: {
            fetch: getFees,
            start: '2024-04-30'
        },
    },
};
export default adapter;
