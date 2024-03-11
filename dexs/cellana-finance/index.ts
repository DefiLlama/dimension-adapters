import {httpGet} from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
//API
const config_rule = {
    headers: {
        'user-agent': 'axios/1.6.7'
    },
    withCredentials:true
}
const cellanaDappUrl = 'https://api.cellana.finance/api/v1/tool/trading-volume-chart?timeframe=';

const dayEndpoint = (endTimestamp: number, timeframe: string) =>
    cellanaDappUrl + timeframe + `&endTimestamp=${endTimestamp}` 

const totalEndpoint = (endTimestamp: number, timeframe: string) =>
     cellanaDappUrl + timeframe 

interface IVolumeall {
    value: number;
    timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayVolumeQuery = (await httpGet(dayEndpoint(timestamp, "VOLUME_1H"), config_rule)).data;
    const dailyVolume = dayVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalVolumeQuery = (await httpGet(totalEndpoint(0, "VOLUME_ALL"), config_rule)).data;
    const totalVolume = totalVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const dayFeesQuery = (await httpGet(dayEndpoint(timestamp, "FEE_1H"), config_rule)).data;
    const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalFeesQuery = (await httpGet(totalEndpoint(0, "FEE_ALL"), config_rule)).data;
    const totalFees = totalFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const dailyProtocolRevenue = 0;
    const totalProtocolRevenue = 0;

    return {
        totalVolume: `${totalVolume}`,
        dailyVolume: `${dailyVolume}`,
        totalFees: `${totalFees}`,
        dailyFees: `${dailyFees}`,
        totalProtocolRevenue: `${totalProtocolRevenue}`,
        dailyProtocolRevenue: `${dailyProtocolRevenue}`,
        timestamp,
    };
};


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch,
            start: 1709078400
        },
    },
};

export default adapter;
