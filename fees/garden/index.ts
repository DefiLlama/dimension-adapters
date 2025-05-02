import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const chainMapper: Record<string, string> = {
    [CHAIN.ETHEREUM]: "ethereum",
    [CHAIN.BITCOIN]: "bitcoin",
    [CHAIN.ARBITRUM]: "ethereum_arbitrum",
};

const baseUrl = "https://referral.garden.finance";

const feeUrl = (chain: string, timestamp: number, interval?: string) =>
    `${baseUrl}/fee?chain=${chain}&end=${timestamp}${
        interval ? `&interval=${interval}` : ""
    }`;

type ApiFeeResponse = {
    data: {
        fee: string;
    };
};

const fetch = (chain: string) => async ({ endTimestamp }: FetchOptions) => {
    const dailyFeeResponse: ApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], endTimestamp, "day"))
    );

    const totalFeeResponse: ApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], endTimestamp))
    );

    const dailyUserFees = new BigNumber(dailyFeeResponse.data.fee);
    const totalUserFees = new BigNumber(totalFeeResponse.data.fee);

    // //response is in usd
    const dailyFees = dailyUserFees;
    const totalFees = totalUserFees;

    return {
        dailyFees,
        totalFees,
        dailyUserFees: dailyUserFees,
        totalUserFees: totalUserFees,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(chainMapper).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain as CHAIN),
                start: '2023-11-01',
                meta: {
                    methodology: {
                        Fees: "Users pay 0.3% flat fee for each swap",
                    },
                },
            },
        };
    }, {}),
};

export default adapter;
