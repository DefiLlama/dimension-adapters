import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const chains = [
    CHAIN.ETHEREUM,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BSC,
    CHAIN.FANTOM,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON
];

interface IVolumeResponse {
    timestamp?: number;
    dailyVolume: string;
    earliestTimestamp: number;
    totalVolume: string;
}

const urlTemplate = "http://<NETWORK>.<CHAIN>.api.dexible.io/v1/stats/volume?";

const buildPath = (network: string, chain: string = "mainnet"): string => {
    return urlTemplate.replace("<NETWORK>", network)
        .replace("<CHAIN>", chain);
}

const chainPath = (chain: string): string => {
    switch (chain) {
        case CHAIN.ARBITRUM: {
            return buildPath("arbitrum");
        }
        case CHAIN.AVAX: {
            return buildPath("avalanche");
        }
        case CHAIN.BSC: {
            return buildPath("bsc")
        }
        case CHAIN.ETHEREUM: {
            return buildPath("ethereum");
        }
        case CHAIN.FANTOM: {
            return buildPath("fantom", "opera");
        }
        case CHAIN.OPTIMISM: {
            return buildPath("optimism");
        }
        case CHAIN.POLYGON: {
            return buildPath("polygon");
        }
        default:
            throw new Error("No compatible chain found")
    }
}

const getVolume = async (chain: string, timestamp: number): Promise<{
    timestamp: number;
    dailyVolume: string;
    totalVolume: string;
}> => {
    const url = `${chainPath(chain)}timestamp=${timestamp}`;
    const r = await httpGet(url);
    const data = r as IVolumeResponse;
    return {
        timestamp: data.timestamp || timestamp,
        dailyVolume: data.dailyVolume,
        totalVolume: data.totalVolume
    };
}

const getFetch = (chain: string): Fetch => async (timestamp: number) => {
    return getVolume(chain, timestamp);
}

const adapter: BreakdownAdapter = {
    breakdown: {
        "Dexible_v2": {
            ...chains.reduce((acc, chain) => {
                return {
                    ...acc,
                    [chain]: {
                        fetch: getFetch(chain),
                        start: async () => {
                            const url = `${chainPath(chain)}timestamp=${Math.ceil(Date.now() / 1000)}`;
                            const r = await httpGet(url);
                            const data = r as IVolumeResponse;
                            return data.earliestTimestamp
                        }
                    }
                }
            }, {}) as SimpleAdapter['adapter']
        }
    }
}

export default adapter;