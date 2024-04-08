import type { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const bitoroApiVolumeEndpoint = "https://api.bitoro.network/btr/stats/volume"
const bitoroLaunchDate = 1706140800
// get current UTC in seconds
const currentUTCTimestamp = Math.floor(Date.now() / 1000);
// get 24 hour ago UTC in seconds
const lastDayUTCTimestamp = currentUTCTimestamp - 86400;


// constructing request URL
const makeRequest = (startTime: number, endTime: number) => bitoroApiVolumeEndpoint + `?start=${startTime}&end=${endTime}`

const fetch = async (timestamp: number) => {
    const startOfTodayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

    // Get today's volume
    let request = makeRequest(startOfTodayTimestamp, timestamp)
    let data = await httpGet(request)
    const todayVolume = data["volume"]

    // Get today's volume
    request = makeRequest(bitoroLaunchDate, timestamp)
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
            fetch
        }
    }
}


export default adapter;
