import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSwaps } from "./helper";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const swaps = await getSwaps(options);
    for (const swap of swaps) dailyVolume.add(swap.coinIn, swap.amountIn);

    return {
        dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2025-05-30',
        }
    },
    methodology: {
        Volume: 'Input amount of every swap on Full Sail CLMM pools, from on-chain swap events.',
    },
};

export default adapter;
