import fetchURL from "../../utils/fetchURL"
import {FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.prod.rabbitx.io/bfx/volume"
const volumeByTime = (timestampFrom: number, timestampTo: number) => {
    const url = `${historicalVolumeEndpoint}?start_date=${timestampFrom}&end_date=${timestampTo}`;
    return url;
}

interface IVolumeall {
    volume: string;
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const fromMS = dayTimestamp * 1000 * 1000;
    const toMS = (dayTimestamp + 60 * 60 * 24) * 1000 * 1000;

    const response = await fetchURL(volumeByTime(fromMS, toMS));
    const marketsData: IVolumeall[] = response.result;
    const dailyVolume = marketsData.reduce((acc, {volume}) => acc + Number(volume), 0);

    return {
        dailyVolume: dailyVolume,
        timestamp: timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        "blast": {
            fetch: fetchVolume,
            start: '2023-11-17', // Replace with actual start timestamp
        },
    },
};

export default adapter;
