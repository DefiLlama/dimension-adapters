import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const statisticsEndpoint = "https://ton.diamonds/api/v2/dex/stats"

const fetch: FetchV2 = async () => {
    const statistics = await httpGet(statisticsEndpoint)

    return {
        timestamp: Math.floor(new Date(statistics?.data?.yesterday).getTime() / 1000),
        dailyVolume: statistics?.data?.yesterdayVolume,
    };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            runAtCurrTime: true,
            start: '2024-09-01',
        },
    }
}

export default adapter;
