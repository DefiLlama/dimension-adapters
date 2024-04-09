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
    const startOfDayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const utcTimeNow = Math.ceil(new Date().getTime() / 3600000) * 3600;

    // Get today's volume
    let request = makeRequest(startOfDayTimestamp, utcTimeNow)
    let data = await httpGet(request)
    const todayVolume = data["volume"]
    console.log(request)


    // Get total volume
    request = makeRequest(bitoroLaunchDate, utcTimeNow)
    data = await httpGet(request)
    const totalVolume = data["volume"]
    console.log(request)


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
