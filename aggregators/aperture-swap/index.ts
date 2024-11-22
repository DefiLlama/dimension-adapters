import { httpGet } from "../../utils/fetchURL";
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
    dailyVolume: VolumeInfo[];
    totalVolume: VolumeInfo[];
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
    const chainId = chainToId[options.chain]
    if (!chainId) {
        return {
            dailyVolume: 0,
            totalVolume: 0,
            timestamp: timestamp,
        }
    }
    const fetchUrl = `${url}?chainid=${chainId}&timestamp=${timestamp}`
    const data: VolumeResponse = (await httpGet(fetchUrl, { timeout: 100000 }));

    if (data) {
        let dailyVolume :number = 0
        let totalVolume :number = 0
        if (data.dailyVolume) {
            data.dailyVolume.forEach(r => {
                if (r.chainId == chainId) {
                    dailyVolume = r.tve
                }
            })
        }

        if (data.totalVolume) {
            data.totalVolume.forEach(r => {
                if (r.chainId == chainId) {
                    totalVolume = r.tve
                }
            })
        }

        return {
            dailyVolume: dailyVolume,
            totalVolume: totalVolume,
            timestamp: timestamp
        }
    } else {
        //console.log("no data")
        return {
            dailyVolume: 0,
            totalVolume: 0,
            timestamp: timestamp,
        }
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-07-18',
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-07-10',
        },
        [CHAIN.AVAX]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-10-07',
        },
        [CHAIN.BASE]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-10-13',
        },
        [CHAIN.BSC]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-10-10',
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-10-09',
        },
        [CHAIN.POLYGON]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-10-09',
        },
        [CHAIN.MANTA]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-09-19',
        },
        [CHAIN.SCROLL]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: '2023-12-16',
        }
    }
};

export default adapter
