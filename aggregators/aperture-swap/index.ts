import fetchURL from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainToId: Record<string, number> = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.AVAX]: 43114,
    [CHAIN.BSC]: 56,
    [CHAIN.FANTOM]: 250,
    [CHAIN.OPTIMISM]: 10,
    [CHAIN.POLYGON]: 137,
    [CHAIN.LINEA]: 59144,
    [CHAIN.SCROLL]: 534352,
    [CHAIN.ERA]: 324,
    [CHAIN.CRONOS]: 25,
    [CHAIN.MANTA]: 169,
};


const url = "https://api.aperture.finance/getMetricsBreakDownSinceInception"

interface VolumeInfo {
    chainId: number;
    tve: number;
    txCount: number;
}

interface VolumeResponse {
    dailyVolume: VolumeInfo;
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
    const chainId = chainToId[options.chain]

    const data: VolumeResponse = await fetchURL(`${url}?chainid=${chainId}&timestamp=${timestamp}`);

    const dailyVolume: number = data.dailyVolume.chainId == chainId ? data.dailyVolume.tve : 0

    return {
        dailyVolume: dailyVolume,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2023-07-18',
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2023-07-10',
        },
        [CHAIN.AVAX]: {
            fetch,
            start: '2023-10-07',
        },
        [CHAIN.BASE]: {
            fetch,
            start: '2023-10-13',
        },
        [CHAIN.BSC]: {
            fetch,
            start: '2023-10-10',
        },
        [CHAIN.OPTIMISM]: {
            fetch,
            start: '2023-10-09',
        },
        [CHAIN.POLYGON]: {
            fetch,
            start: '2023-10-09',
        },
        [CHAIN.MANTA]: {
            fetch,
            start: '2023-09-19',
        },
        [CHAIN.SCROLL]: {
            fetch,
            start: '2023-12-16',
        }
    }
};

export default adapter
