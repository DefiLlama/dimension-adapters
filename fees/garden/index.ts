import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const chainMapper: Record<string, string> = {
    [CHAIN.ETHEREUM]: "ethereum",
    [CHAIN.BITCOIN]: "bitcoin",
    [CHAIN.ARBITRUM]: "ethereum_arbitrum",
};

const baseUrl = "http://leaderboard.garden.finance";

const feeUrl = (chain: string, timestamp: number, interval?: string) =>
    `${baseUrl}/fee?chain=${chain}&end=${timestamp}${
        interval ? `&interval=${interval}` : ""
    }`;

type IApiFeeResponse = {
    data: {
        fee: string;
    };
};

const fetch = (chain: string) => async (timestamp: number) => {
    const dailyFeeResponse: IApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], timestamp, "day"))
    ).data;

    const totalFeeResponse: IApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], timestamp))
    ).data;

    const dailyUserFees = new BigNumber(dailyFeeResponse.data.fee);

    const totalUserFees = new BigNumber(totalFeeResponse.data.fee);

    // //response is in usd
    return {
        dailyUserFees,
        totalUserFees,
    };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(chainMapper).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain as CHAIN),
                start: async () => 1698796799,
                meta: {
                    methodology: {
                        Fees: "Users pay 0.3% for each swap along with a base fee",
                    },
                },
            },
        };
    }, {}),
};

export default adapter;
