import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const chainMapper: Record<string, string> = {
    [CHAIN.ETHEREUM]: "ethereum",
    [CHAIN.BITCOIN]: "bitcoin",
    [CHAIN.ARBITRUM]: "arbitrum",
    [CHAIN.BASE]: "base",
    [CHAIN.UNICHAIN]: "unichain",
    [CHAIN.BERACHAIN]: "bera",
    [CHAIN.STARKNET]: "starknet",
    [CHAIN.HYPERLIQUID]: "hyperliquid",
};

const baseUrl = "https://api.garden.finance/orders";

const feeUrl = (chain: string, timestamp: number, interval?: string) =>
    `${baseUrl}/volume?chain=${chain}&end=${timestamp}${
        interval ? `&interval=${interval}` : ""
    }`;

type ApiFeeResponse = {
    status: string;
    result: string;
};

const fetch = (chain: string) => async ({ endTimestamp }: FetchOptions) => {
    const dailyVolumeResponse: ApiFeeResponse = await fetchURL(
        feeUrl(chainMapper[chain], endTimestamp, "day")
    );

    const totalVolumeResponse: ApiFeeResponse = await fetchURL(
        feeUrl(chainMapper[chain], endTimestamp)
    );

    const dailyVolume = new BigNumber(dailyVolumeResponse.result);
    const totalVolume = new BigNumber(totalVolumeResponse.result);

    return {
        dailyVolume,
        totalVolume,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(chainMapper).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain as CHAIN),
                start: '2023-08-23',
                meta: {
                    methodology: {
                        Volume: "Cumulative USD value of trades executed on the Garden protocol",
                    },
                },
            },
        };
    }, {}),
};

export default adapter;