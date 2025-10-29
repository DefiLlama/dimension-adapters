import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://volume-tracking.icecreamswap.dev';
const CHAINS_API = 'https://api.nordstern.finance/chains';

interface IAPIResponse {
    dailyVolume: string;
}

type ChainApiEntry = {
    ChainID: string | number;
    ChainName: string;
    DefillamaName: string;
}

type ChainApiResponse = Record<string, ChainApiEntry>;

const commonStartTime = '2025-08-01';

const buildChainConfig = async (): Promise<Record<string, { id: number, start: string }>> => {
    const response = await fetchURL(CHAINS_API) as ChainApiResponse;
    const dynamicChainConfig: Record<string, { id: number, start: string }> = {};

    for (const entry of Object.values(response)) {
        const id = Number(entry.ChainID);
        const chainName = entry.ChainName;
        const defillamaName = entry.DefillamaName;

        // Determine which name to use as the key
        let chainKey: string | null = null;
        if (Object.values(CHAIN).includes(defillamaName as CHAIN)) {
            chainKey = defillamaName;
        } else if (Object.values(CHAIN).includes(chainName as CHAIN)) {
            chainKey = chainName;
        }

        if (chainKey) {
            dynamicChainConfig[chainKey] = { id, start: commonStartTime };
        } else {
            console.log("chain not supported, skipping: " + chainName);
        }
    }
    console.log("chains Length: " + Object.keys(dynamicChainConfig).length);
    return dynamicChainConfig;
};

let chainConfigPromise: Promise<Record<string, { id: number, start: string }>> | null = null;
const getChainConfig = () => {
    if (!chainConfigPromise) chainConfigPromise = buildChainConfig();
    return chainConfigPromise;
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const config = await getChainConfig();
    const chainId = config[options.chain]?.id;
    if (!chainId) {
        // Chain not supported
        return { dailyVolume: "0" };
    }

    const endpoint = `/api/v1/statistics/${chainId}/${options.dateString}`;
    const response: IAPIResponse = await fetchURL(`${URL}${endpoint}`);

    return {
        dailyVolume: response.dailyVolume || 0
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    adapter: Object.fromEntries(
        Object.values(CHAIN).map((chain) => [
            chain,
            {
                start: async () => {
                    const cfg = await getChainConfig();
                    const entry = cfg[chain];
                    // If chain is supported, use commonStartTime; otherwise set far future to skip
                    return entry ? new Date(commonStartTime).getTime() / 1000 : Math.trunc(Date.now() / 1000) + 10 ** 9;
                }
            }
        ])
    ),
};

export default adapter;