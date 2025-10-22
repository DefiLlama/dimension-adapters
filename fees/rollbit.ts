import fetchURL from "../utils/fetchURL"
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    // Doesnt work because of CF block
    const historicalVolume: any[] = (await fetchURL(`https://rollbit.com/public/lottery/pools`)).response;

    const dailyDistributed = historicalVolume
        .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.distributed_at)) === dayTimestamp)?.distributed

    return {
        dailyFees: (dailyDistributed * 5).toString(),
        dailyRevenue: (dailyDistributed * 5).toString(),
        holdersRevenue: (dailyDistributed).toString(),
        timestamp: dayTimestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2022-02-01',
        },
    },
    methodology: {
        Fees: "Money that users lose gambling",
        Revenue: "Money that users lose gambling",
        HoldersRevenue: "20% of profits that go into lottery"
    }
};

export default adapter;
