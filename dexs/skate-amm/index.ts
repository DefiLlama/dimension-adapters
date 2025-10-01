import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const skateChainIds: Record<string, number> = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.BSC]: 56,
    [CHAIN.BASE]: 8453,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.SOLANA]: 901,
    [CHAIN.ECLIPSE]: 902,
    [CHAIN.HYPERLIQUID]: 999,
    [CHAIN.PLUME]: 98866,
    [CHAIN.MANTLE]: 5000,
    [CHAIN.SUI]: 1001
}

const skateDataApi = "https://api.skatechain.org/amm-data/pools/stats";

const fetch = async (options: FetchOptions) => {

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const tokenVolume_options = {
        params: {
            chainId: skateChainIds[options.api.chain],
            startTime: options.startTimestamp,
            endTime: options.endTimestamp,
        }
    }
    const tokenVolumeInfo = await httpGet(skateDataApi, tokenVolume_options);

    for (const tokenInfo of tokenVolumeInfo.data) {
        dailyVolume.add(tokenInfo.token, tokenInfo.volume);
        dailyFees.add(tokenInfo.token, tokenInfo.fees);
    }

    return {
        dailyVolume,
        dailyFees
    }
};

const methodology = {
    Volume: "Total token swap volumes by users.",
    Fees: 'All fees paid by users for trading.'
}

const adapter: SimpleAdapter = {
    methodology,
    version: 2,
    fetch,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2025-03-24', },
        // [CHAIN.BSC]: { start: '2025-04-07', },
        [CHAIN.BASE]: { start: '2025-03-17', },
        [CHAIN.ARBITRUM]: { start: '2025-03-17', },
        [CHAIN.SOLANA]: { start: '2025-04-01', },
        [CHAIN.ECLIPSE]: { start: '2025-04-02', },
        [CHAIN.HYPERLIQUID]: { start: '2025-05-28', },
        [CHAIN.PLUME]: { start: '2025-06-02', },
        [CHAIN.MANTLE]: { start: '2025-05-28', },
        [CHAIN.SUI]: { start: '2025-06-22', }
    },
}

export default adapter;
