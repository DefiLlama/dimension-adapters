import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import {FetchOptions, FetchResult, SimpleAdapter} from "../../adapters/types";

const volumeEndpoint = "https://www.sunperp.com/api/v1/app-gw/hbg/v1/app/dex/home/tradeVolumeStat"

interface respData {
    date: string;
    dailyVolume: number;
}

const configRule = {
    headers: {
        "Accept": "*/*",
    },
};

const fetch = async (_,_a:any,{ startOfDay }: FetchOptions): Promise<FetchResult> => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(startOfDay);
    const dateStr = new Date(dayTimestamp * 1000).toISOString().split('T')[0];

    const resp = await httpGet(volumeEndpoint, configRule);
    if (!resp || !resp.success) {
        return {
            timestamp: dayTimestamp,
        }
    }

    const data: respData[] = resp.data;
    const dailyVolume = data.find(dayItem => dayItem.date === dateStr)?.dailyVolume as any
    if (!dailyVolume) {
        return {
            timestamp: dayTimestamp,
        }
    }
    return {
        timestamp: dayTimestamp,
        dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.TRON]: {
            fetch,
        },
    },
};

export default adapter;