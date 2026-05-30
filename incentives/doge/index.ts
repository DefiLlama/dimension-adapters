import { Adapter, Fetch, FetchResultIncentives, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";
import * as sdk from "@defillama/sdk";

const getIncentives: Fetch = async (timestamp: number): Promise<FetchResultIncentives> => {
    const today = new Date(getTimestampAtStartOfDayUTC(timestamp) * 1000).toISOString()
    const yesterday = new Date(getTimestampAtStartOfPreviousDayUTC(timestamp) * 1000).toISOString()
    const result = await httpGet(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=doge&metrics=IssTotNtv&start_time=${yesterday}&end_time=${today}&frequency=1d`)
    if (result.data.length < 2) {
        throw new Error(`Failed to fetch CoinMetrics issuance data for doge on ${today}`)
    }
    const issuance = parseFloat(result.data[1]['IssTotNtv'])
    const tokenIncentives = await sdk.Balances.getUSDString({ 'coingecko:dogecoin': issuance }, timestamp)
    return { timestamp, tokenIncentives }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.DOGE]: {
            fetch: getIncentives,
            start: '2013-12-08',
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter
