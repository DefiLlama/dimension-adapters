import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const chainMapper: Record<string, { name: string, start: string }> = {
    [CHAIN.ETHEREUM]: {
        name: "ethereum",
        start: "2023-08-23",
    },
    [CHAIN.BITCOIN]: {
        name: "bitcoin",
        start: "2023-08-23",
    },
    [CHAIN.ARBITRUM]: {
        name: "arbitrum",
        start: "2023-08-23",
    },
    [CHAIN.BASE]: {
        name: "base",
        start: "2024-12-11",
    },
    [CHAIN.UNICHAIN]: {
        name: "unichain",
        start: "2025-04-17",
    },
    [CHAIN.BERACHAIN]: {
        name: "bera",
        start: "2025-02-10",
    },
    [CHAIN.STARKNET]: {
        name: "starknet",
        start: "2023-08-23",
    },
    [CHAIN.HYPERLIQUID]: {
        name: "hyperliquid",
        start: "2025-04-17",
    },
};
const baseUrl = "https://api.garden.finance/orders";

const feeUrl = (chain: string, timestamp: number, interval?: string) =>
    `${baseUrl}/volume?chain=${chain}&end=${timestamp}${interval ? `&interval=${interval}` : ""
    }`;

type ApiFeeResponse = {
    status: string;
    result: string;
};

const fetch = (chain: string) => async ({ endTimestamp }: FetchOptions) => {
    const dailyVolumeResponse: ApiFeeResponse = await fetchURL(
        feeUrl(chainMapper[chain].name, endTimestamp, "day")
    );

    const dailyVolume = new BigNumber(dailyVolumeResponse.result);

    return {
        dailyVolume
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    methodology: {
        Volume: "Cumulative USD value of trades executed on the Garden protocol",
    },
    adapter: Object.keys(chainMapper).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain),
                start: chainMapper[chain].start,
            },
        };
    }, {}),
};

export default adapter;