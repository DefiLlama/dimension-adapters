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
];

const chainToId: Record<string, number> = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.BSC]: 56,
    [CHAIN.BASE]: 8453,
    [CHAIN.LINEA]: 59144,
    [CHAIN.SCROLL]: 534352,
    [CHAIN.CRONOS]: 25,
    [CHAIN.MANTA]: 169
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
                    start: 1705104000,
                },
            };
        }, {}),
    },
};

export default adapter;
