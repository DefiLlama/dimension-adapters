import {Adapter} from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import {CHAIN} from "../helpers/chains";
import {getUniqStartOfTodayTimestamp} from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.FANTOM]: "https://api.mummy.finance/api/app-stats",
    [CHAIN.OPTIMISM]: "https://api.mummy.finance/optimism/api/app-stats",
}

interface IFees {
    totalFees: string;
    fee24H: string;
    totalVolume: string;
};

const getFetch = (chain: string) => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const feesData: IFees = (await fetchURL(endpoints[chain]))?.data;

    const dailyFees = Number(feesData.fee24H) / 10 ** 30;
    const totalFees = Number(feesData.totalFees) / 10 ** 30;
    const totalRevenue = totalFees * 0.05;
    const dailyRevenue = dailyFees && dailyFees * 0.05;

    return {
        timestamp: dayTimestamp,
        totalFees: totalFees.toString(),
        dailyFees: dailyFees?.toString(),
        totalRevenue: totalRevenue.toString(),
        dailyRevenue: (dailyRevenue && dailyFees) ? dailyRevenue.toString() : undefined,
    };
}


const adapter: Adapter = {
    adapter: {
        [CHAIN.FANTOM]: {
            fetch: getFetch(CHAIN.FANTOM),
            start: async () => 0,
            // runAtCurrTime: true
        },
        [CHAIN.OPTIMISM]: {
            fetch: getFetch(CHAIN.OPTIMISM),
            start: async () => 0,
            // runAtCurrTime: true
        },
    },
}

export default adapter;
