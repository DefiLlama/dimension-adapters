import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://api.prod.rabbitx.io/bfx/volume"
const volumeByTime = (timestampFrom: number, timestampTo: number) => {
    const url = `${historicalVolumeEndpoint}?start_date=${timestampFrom}&end_date=${timestampTo}`;
    return url;
}

interface IVolumeall {
    volume: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const fromMS = options.startOfDay * 1000 * 1000;
    const toMS = (options.startOfDay + 60 * 60 * 24) * 1000 * 1000;

    const response = await fetchURL(volumeByTime(fromMS, toMS));
    const marketsData: IVolumeall[] = response.result;
    const dailyVolume = marketsData.reduce((acc, { volume }) => acc + Number(volume), 0);

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.BLAST],
    start: '2023-11-17',
};

export default adapter;
