import { FetchResultFees, SimpleAdapter } from "../../adapters/types";
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

const fetch = (chain: string) => async (timestamp: number): Promise<FetchResultFees> => {
    const dailyFeeResponse: IApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], timestamp, "day"))
    );

    const totalFeeResponse: IApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], timestamp))
    );

    const dailyUserFees = new BigNumber(dailyFeeResponse.data.fee);
    const totalUserFees = new BigNumber(totalFeeResponse.data.fee);

    // //response is in usd
    const dailyFees = dailyUserFees;
    const totalFees = totalUserFees;

    return {
        timestamp,
        dailyFees: dailyFees.toString(),
        totalFees: totalFees.toString(),
        dailyUserFees: dailyUserFees.toString(),
        totalUserFees: totalUserFees.toString(),
    };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(chainMapper).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain as CHAIN),
                start: 1698796799,
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
