import fetchURL from "../../utils/fetchURL"
import type {SimpleAdapter} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";

const URL = "https://api.deflex.fi/api/volumeStats"

interface IAPIResponse {
    volume: any;
};

const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const response: IAPIResponse[] = (await fetchURL(URL)).last_24h;
    return {
        dailyVolume: `${response.reduce((prev: number, current: any) => current.volume + prev, 0)}`,
        timestamp: dayTimestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        algorand: {
            fetch,
            runAtCurrTime: true,
            customBackfill: undefined,
            start: 0,
        },
    }
};

export default adapter;
