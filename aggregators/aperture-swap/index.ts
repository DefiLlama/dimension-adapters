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
            start: 1689657695,
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1689014691,
        },
        [CHAIN.AVAX]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1696671295,
        },
        [CHAIN.BASE]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1697229723,
        },
        [CHAIN.BSC]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1696963675,
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1696888429,
        },
        [CHAIN.POLYGON]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1696888519,
        },
        [CHAIN.MANTA]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1695079629,
        },
        [CHAIN.SCROLL]: {
            fetch: fetch,
            runAtCurrTime: false,
            start: 1702694992,
        }
    }
};

export default adapter
