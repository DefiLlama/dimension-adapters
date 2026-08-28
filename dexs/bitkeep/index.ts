import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://new-swapopen.bitapi.vip/st/getOrderDayList"

interface IVolumeall {
    volume: string;
    date: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${options.chain}`))?.data.list;

    const dailyVolume = historicalVolume
        .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === options.startOfDay)?.volume

    return { dailyVolume };
}


const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.ARBITRUM, CHAIN.OPTIMISM],
    start: '2022-10-31',
};

export default adapter;
