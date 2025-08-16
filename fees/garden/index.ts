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
    `${baseUrl}/fees?chain=${chain}&end=${timestamp}${interval ? `&interval=${interval}` : ""
    }`;

type ApiFeeResponse = {
    status: string;
    result: string;
};

const fetch = (chain: string) => async (options: FetchOptions) => {
    const dailyFeeResponse: ApiFeeResponse = await fetchURL(
        feeUrl(chainMapper[chain].name, options.endTimestamp, "day")
    );

    const dailyUserFees = new BigNumber(dailyFeeResponse.result);

    // response is in USD
    const dailyFees = dailyUserFees;
    const dailyRevenue = dailyUserFees;

    return {
        dailyFees,
        dailyRevenue,
        dailyUserFees,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(chainMapper).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain as CHAIN),
                start: chainMapper[chain].start,
            },
        };
    }, {}),
    methodology: {
        Fees: "Users pay a fee for each swap",
        Revenue: "Users pay a fee for each swap",
    },
};

export default adapter;
