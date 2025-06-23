import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {postURL} from "../../utils/fetchURL";
import {randomInt} from "node:crypto";
import {getTimestampAtStartOfDayUTC} from "../../utils/date";

const URL = 'https://api.tapp.exchange/api/v1'

interface IPool {
    poolId: string;
}

interface ListPoolResponse {
    data?: IPool[];
    total: number;
}

interface ChartResponse {
    x: string,
    y: string
}

const getVolume = async (start: number, end: number) => {
    const body = {
        "method": "public/platform_volume_chart",
        "jsonrpc": "2.0",
        "id": randomInt(1, 1000),
        "params": {
            "query": {
                "startTime": start,
                "endTime": end,
                "interval": "1d"
            }
        }
    }
    const volume: { result: ChartResponse[] } = await postURL(URL, body)

    return volume.result[0]?.y || 0
}

const getListPool = async (page: number, pageSize: number) => {
    const body = {
        "method": "public/pool",
        "jsonrpc": "2.0",
        "id": randomInt(1, 1000),
        "params": {
            "query": {
                "page": page,
                "pageSize": pageSize,
                "keyword": "",
                "orderBy": "tvl"
            }
        }
    }
    const pools: { result: ListPoolResponse } = await postURL(URL, body)

    return pools.result.data ?? [];
}

const getFeeChart = async (start: number, end: number, poolId: string) => {
    const body = {
        "method": "public/pool_fee_chart",
        "jsonrpc": "2.0",
        "id": randomInt(1, 1000),
        "params": {
            "query": {
                "poolId": poolId,
                "startTime": start,
                "endTime": end,
                "interval": "1d"
            }
        }
    }
    const fees: { result: ChartResponse[] } = await postURL(URL, body)


    return Number(fees.result[0]?.y ?? 0);
}


const fetch = async (timestamp: number) => {
    const startOfDay = getTimestampAtStartOfDayUTC(timestamp) * 1000;
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1000;

    const page = 1
    const pageSize = 200
    let dailyFees = 0

    const dailyVolume = await getVolume(startOfDay, endOfDay);
    const pools = await getListPool(page, pageSize)


    for (const pool of pools) {
        const fee = await getFeeChart(startOfDay, endOfDay, pool.poolId)
        dailyFees += fee
    }

    const dailyRevenue = Number(dailyFees) * 0.33;

    return {
        dailyFees,
        dailyRevenue,
        dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch: fetch,
            start: "2025-06-12"
        },
    },
};

export default adapter;