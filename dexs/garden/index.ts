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
const volumeUrl = (chain: string, timestamp: number, interval?: string) =>
    `${baseUrl}/volume?chain=${chain}&end=${timestamp}${
        interval ? `&interval=${interval}` : ""
    }`;

const feeUrl = (chain: string, timestamp: number, interval?: string) =>
    `${baseUrl}/fee?chain=${chain}&end=${timestamp}${
        interval ? `&interval=${interval}` : ""
    }`;

type IAPIVolumeResponse = {
    data: {
        volume: string;
    };
};

type IApiFeeResponse = {
    data: {
        fee: string;
    };
};

const fetch = (chain: string) => async (timestamp: number) => {
    console.log(timestamp);
    const dailyVolumeResponse: IAPIVolumeResponse = (
        await fetchURL(volumeUrl(chainMapper[chain], timestamp, "day"))
    ).data;

    const totalVolumeResponse: IAPIVolumeResponse = (
        await fetchURL(volumeUrl(chainMapper[chain], timestamp))
    ).data;

    const dailyFeeResponse: IApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], timestamp, "day"))
    ).data;

    const totalFeeResponse: IApiFeeResponse = (
        await fetchURL(feeUrl(chainMapper[chain], timestamp))
    ).data;

    const dailyVolume = new BigNumber(dailyVolumeResponse.data.volume);

    const totalVolume = new BigNumber(totalVolumeResponse.data.volume);

    const dailyUserFees = new BigNumber(dailyFeeResponse.data.fee);

    const totalUserFees = new BigNumber(totalFeeResponse.data.fee);

    // //response is in usd
    return {
        dailyVolume,
        totalVolume,
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
                        Fees: "Users pay 0.3% for each swap",
                    },
                },
            },
        };
    }, {}),
};

export default adapter;
