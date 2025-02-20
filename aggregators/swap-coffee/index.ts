import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const statisticsEndpoint = "https://backend.swap.coffee/v1/statistics/generic"

const fetch: FetchV2 = async ({startTimestamp, endTimestamp}) => {
    const statistics = await httpGet(
        statisticsEndpoint,
        {
            params: {
                from: startTimestamp,
                to: endTimestamp - 1
            }
        })

    return {
        dailyVolume: statistics?.volume,
        dailyFees: statistics?.fees,
    };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2024-06-09',
        },
    }
}

export default adapter;
