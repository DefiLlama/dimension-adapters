import {FetchOptions, SimpleAdapter} from "../../adapters/types"
import {CHAIN} from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL";

const fetchVolume = async (timestamp: number, _: any, options: FetchOptions) => {
    const url = `https://api.reactor.exchange/api/v1/volume/daily?from=${options.startTimestamp}&to=${options.endTimestamp}`
    const resp = await fetchURL(url)
    return {
        dailyVolume: resp.volumeUSD,
        timestamp: timestamp,
    }
}

const adapters: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.FUEL]: {
            fetch: fetchVolume,
            start: '2025-10-09',
        }
    }
}

export default adapters
