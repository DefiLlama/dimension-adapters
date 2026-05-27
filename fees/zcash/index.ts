import { FetchOptions, ProtocolType, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances()

    const feeData = await fetchURL(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=zec&metrics=FeeTotNtv&start_time=${options.dateString}&end_time=${options.dateString}&frequency=1d`)

    if (!feeData || !feeData.data || !feeData.data.length) {
        throw new Error(`No data found for date ${options.dateString}`)
    }

    const todaysData = feeData.data.find((item: any) => item.time === `${options.dateString}T00:00:00.000000000Z`)
    if (!todaysData || !todaysData.FeeTotNtv) {
        throw new Error(`No data found for date ${options.dateString}`)
    }

    dailyFees.addCGToken('zcash', Number(todaysData.FeeTotNtv))
    return { dailyFees, dailyRevenue: 0 }
}

const methodology = {
    Fees: "Includes total transaction fees paid by users.",
    Revenue: "No revenue",
}

const adapter: SimpleAdapter = {
    fetch,
    start: '2016-12-22',
    chains: [CHAIN.ZEC],
    methodology,
    protocolType: ProtocolType.CHAIN,
}

export default adapter