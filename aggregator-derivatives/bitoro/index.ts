import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BitoroX_BASE_URL = "https://min-api.bitoro.network/btr/stats/global";
const BitoroPro_BASE_URL = "https://min-api.inj.bitoro.network/stats/global";
const startTimestamp_bitoro_x = 1711238400; // 2024-03-25 00:00:00
const startTimestamp_bitoro_pro = 1718236800; // 2024-06-14 00:00:00

const getBitoroXUrl = (startTime: number, endTime: number): string => {
    return `${BitoroX_BASE_URL}?start=${startTime}&end=${endTime}`;
}

const getBitoroProUrl = (startTime: number, endTime: number): string => {
    return `${BitoroPro_BASE_URL}?start=${startTime}&end=${endTime}`;
}

const fetchBitoroX = async (_:any, _b:any ,options: any): Promise<FetchResult> => {
    const { endTimestamp, startTimestamp, startOfDay } = options;
    const dailyVolume = await fetchURL(getBitoroXUrl(startTimestamp, endTimestamp));
    const totalVolume = await fetchURL(getBitoroXUrl(startTimestamp_bitoro_x, endTimestamp));

    return {
        timestamp: startOfDay,
        dailyVolume: dailyVolume.volume || 0,
        totalVolume: totalVolume.volume || 0,
    };
};

const fetchBitoroPro = async (_:any, _b:any ,options: any): Promise<FetchResult> => {
    const { fromTimestamp, toTimestamp, startOfDay } = options;
    const dailyVolume = await fetchURL(getBitoroProUrl(fromTimestamp, toTimestamp));
    const totalVolume = await fetchURL(getBitoroProUrl(startTimestamp_bitoro_pro, toTimestamp));

    return {
        timestamp: startOfDay,
        dailyVolume: dailyVolume.volume || 0,
        totalVolume: totalVolume.volume || 0,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchBitoroX,
            start: startTimestamp_bitoro_x
        },
        [CHAIN.INJECTIVE]: {
            fetch: fetchBitoroPro,
            start: startTimestamp_bitoro_pro
        }
    }
}

export default adapter;
