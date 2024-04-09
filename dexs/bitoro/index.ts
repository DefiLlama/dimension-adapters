import type { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";

// Bitoro volume API endpoint
const bitoroApiVolumeEndpoint = "https://api.bitoro.network/btr/stats/volume"
// March 25, 2024 UTC timestamp
const bitoroLaunchDate = 1711324800
// constructing request URL
const makeRequest = (startTime: number, endTime: number) => bitoroApiVolumeEndpoint + `?start=${startTime}&end=${endTime}`

const fetch = async (timestamp: number) => {
    const startOfDayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)) + 86400
    const endOfDayTimestamp = startOfDayTimestamp + 86400;

    // Get today's volume
    let request = makeRequest(startOfDayTimestamp, endOfDayTimestamp)
    let data = await httpGet(request)
    const todayVolume = data["volume"]

    // Get total volume
    request = makeRequest(bitoroLaunchDate, endOfDayTimestamp)
    data = await httpGet(request)
    const totalVolume = data["volume"]

    return {
        timestamp,
        dailyVolume: todayVolume.toString(),
        totalVolume: totalVolume.toString()
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            start: bitoroLaunchDate,
            fetch,
            customBackfill: customBackfill(CHAIN.ARBITRUM, () => fetch)
        }
    }
}



export default adapter;
