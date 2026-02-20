import fetchURL from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
    const chainId = options.api.chainId

    const data: VolumeResponse = await fetchURL(`${url}?chainid=${chainId}&timestamp=${timestamp}`);

    const dailyVolume: number = data.dailyVolume.chainId == chainId ? data.dailyVolume.tve : 0

    return {
        dailyVolume: dailyVolume,
    }
}

const adapter: SimpleAdapter = {
    deadFrom: '2024-06-01',
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
