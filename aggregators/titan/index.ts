import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { DAY, getTimestampAtStartOfDay } from "../../utils/date";

const statisticsEndpoint = "https://api.titan.tg/v1/statistics"

const fetch: FetchV2 = async ({startTimestamp}) => {
    const start = getTimestampAtStartOfDay(startTimestamp)
    const end = start + DAY

    const statistics = await httpGet(
        statisticsEndpoint,
        {
            params: {
                start,
                end
            }
        })

    return {
        timestamp: end,
        dailyVolume: statistics?.volumeUsd,
    };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: 1730250000,
        },
    }
}

export default adapter;
