import { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
//API
const config_rule = {
    headers: {
        'user-agent': 'axios/1.6.7'
    },
    withCredentials: true
}
const cellanaDappUrl = 'https://api.cellana.finance/api/v1/tool/trading-volume-chart?timeframe=';

const dayEndpoint = (endTimestamp: number, timeframe: string) =>
    cellanaDappUrl + timeframe + `&endTimestamp=${endTimestamp}`

interface IVolumeall {
    value: number;
    timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayVolumeQuery = (await httpGet(dayEndpoint(timestamp, "VOLUME_1H"), config_rule)).data;
    const dailyVolume = dayVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);


    const dayFeesQuery = (await httpGet(dayEndpoint(timestamp, "FEE_1H"), config_rule)).data;
    const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);
    const dailyProtocolRevenue = 0;
    const dailyHoldersRevenue = dailyFees;

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        timestamp,
    };
};


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch,
            start: '2024-02-28'
        },
    },
};

export default adapter;
