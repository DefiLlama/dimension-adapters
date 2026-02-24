import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const chains = [
    CHAIN.ETHEREUM,
    CHAIN.BSC,
    CHAIN.BASE,
    CHAIN.LINEA,
    CHAIN.SCROLL,
    CHAIN.CRONOS,
    CHAIN.MANTA,
    CHAIN.BLAST,
    CHAIN.XLAYER,
    CHAIN.METIS,
    CHAIN.ARBITRUM,
    CHAIN.ZETA,
    CHAIN.SONEIUM,
    CHAIN.UNIT0,
];

const chainToId: Record<string, number> = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.BSC]: 56,
    [CHAIN.BASE]: 8453,
    [CHAIN.LINEA]: 59144,
    [CHAIN.SCROLL]: 534352,
    [CHAIN.CRONOS]: 25,
    [CHAIN.MANTA]: 169,
    [CHAIN.BLAST]: 81457,
    [CHAIN.METIS]: 1088,
    [CHAIN.XLAYER]: 196,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.ZETA]: 7000,
    [CHAIN.SONEIUM]: 1868,
    [CHAIN.UNIT0]: 88811,
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyVolume = (await fetchURL(`https://api-gateway.wowmax.exchange/statistics/chains/${chainToId[options.chain]}/volume?timestamp=${options.startOfDay}`))?.volume;

    return {
        dailyVolume,
    };
};

const adapter: any = {
    adapter: {
        ...chains.reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch,
                    start: '2024-01-13',
                },
            };
        }, {}),
    },
};

export default adapter;
