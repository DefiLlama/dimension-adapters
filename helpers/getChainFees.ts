import axios from 'axios';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from '../utils/date';

export const chainAdapter = (adapterKey: string, assetID: string, startTime: number) => {
    const fetch = async (timestamp: number) => {
        const today = new Date(getTimestampAtStartOfDayUTC(timestamp) * 1000).toISOString()
        const yesterday = new Date(getTimestampAtStartOfPreviousDayUTC(timestamp) * 1000).toISOString()
        const dailyFee = await getOneDayFees(assetID, yesterday, today);

        return {
            timestamp,
            totalFees: "0",
            dailyFees: dailyFee.toString(),
            totalRevenue: "0",
            dailyRevenue: "0",
        };
    };

    return {
        [adapterKey]: {
            fetch: fetch,
            start: startTime
        }
    }
};

export const getOneDayFees = async (assetID: string, startDate: string, endDate: string) => {
    const result = await axios.get(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=FeeTotUSD&assets=${assetID}&start_time=${startDate}&end_time=${endDate}`);
    if (!result.data.data[0]) {
        throw new Error(`Failed to fetch CoinMetrics data for ${assetID} on ${endDate}`);
    }

    return parseFloat(result.data.data[0]['FeeTotUSD']);
}