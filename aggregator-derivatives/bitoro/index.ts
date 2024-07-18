import fetchURL from "../../utils/fetchURL";
import { FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BitoroX_BASE_URL = "https://min-api.bitoro.network/btr/stats/global";
const BitoroPro_BASE_URL = "https://min-api.inj.bitoro.network/stats/global";
const startTimestamp_bitoro_x = 1711324800; // 2024-03-25 00:00:00
const startTimestamp_bitoro_pro = 1718323200; // 2024-06-14 00:00:00

const getBitoroXUrl = (startTime: number, endTime: number): string => {
    return `${BitoroX_BASE_URL}?start=${startTime}&end=${endTime}`;
}

const getBitoroProUrl = (startTime: number, endTime: number): string => {
    return `${BitoroPro_BASE_URL}?start=${startTime}&end=${endTime}`;
}

const fetchBitoroX = async (options: any): Promise<FetchResultV2> => {
    const { endTimestamp, startTimestamp } = options;
    const dailyVolume = await fetchURL(getBitoroXUrl(startTimestamp, endTimestamp));
    const totalVolume = await fetchURL(getBitoroXUrl(startTimestamp_bitoro_x, endTimestamp));

    return {
        dailyVolume: dailyVolume.volume || 0,
        totalVolume: totalVolume.volume || 0,
    };
};

const fetchBitoroPro = async (options: any): Promise<FetchResultV2> => {
    const { fromTimestamp, toTimestamp } = options;
    const dailyVolume = await fetchURL(getBitoroProUrl(fromTimestamp, toTimestamp));
    const totalVolume = await fetchURL(getBitoroProUrl(startTimestamp_bitoro_pro, toTimestamp));

    return {
        dailyVolume: dailyVolume.volume || 0,
        totalVolume: totalVolume.volume || 0,
    };
};

export default {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchBitoroX,
            start: startTimestamp_bitoro_x
        },
        [CHAIN.INJECTIVE]: {
            fetch: fetchBitoroPro,
            start: startTimestamp_bitoro_pro
        }
    },
    version: 2
}
