import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

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
};

const fetch = (chain: string) => async (timestamp: number) => {
    const unixTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
    );

    const volume = (
        await fetchURL(
            `https://api-gateway.wowmax.exchange/statistics/chains/${chainToId[chain]}/volume?timestamp=${unixTimestamp}`
        )
    )?.volume;

    return {
        dailyVolume: volume,
        timestamp: unixTimestamp,
    };
};

const adapter: any = {
    adapter: {
        ...chains.reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: fetch(chain),
                    start: '2024-01-13',
                },
            };
        }, {}),
    },
};

export default adapter;
