import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { DAY, getTimestampAtStartOfDay } from "../../utils/date";

const statisticsEndpoint = "https://backend.swap.coffee/v1/statistics/generic"

const fetch: FetchV2 = async ({startTimestamp}) => {
    const start = getTimestampAtStartOfDay(startTimestamp)
    const end = start + DAY

    const statistics = await httpGet(
        statisticsEndpoint,
        {
            params: {
                from: start,
                to: end
            }
        })

    return {
        timestamp: end,
        dailyVolume: statistics?.volume,
        dailyFees: statistics?.fees,
    };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: 1717957740,
        },
    }
}

export default adapter;
