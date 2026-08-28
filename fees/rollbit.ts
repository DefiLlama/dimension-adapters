import fetchURL from "../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const fetch = async (options: FetchOptions) => {
    // Doesnt work because of CF block
    const historicalVolume: any[] = (await fetchURL(`https://rollbit.com/public/lottery/pools`)).response;

    const dailyDistributed = historicalVolume
        .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.distributed_at)) === options.startOfDay)?.distributed

    return {
        dailyFees: (dailyDistributed * 5).toString(),
        dailyRevenue: (dailyDistributed * 5).toString(),
        holdersRevenue: (dailyDistributed).toString(),
    };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2022-02-01',
    methodology: {
        Fees: "Money that users lose gambling",
        Revenue: "Money that users lose gambling",
        HoldersRevenue: "20% of profits that go into lottery"
    }
};

export default adapter;
