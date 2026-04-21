import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const STATS_URL = "https://api.hit.one/api/public/stats/defillama"

interface HitOneStats {
    start: number
    end: number
    volumeUsd: string
    feesUsd: string
}

const fetch = async (options: FetchOptions) => {
    const url = `${STATS_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`
    const data: HitOneStats = await fetchURL(url)

    if (!data || !data.volumeUsd || !data.feesUsd) {
        throw new Error(`Missing data in Hit One stats response for date ${options.dateString}`)
    }

    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()

    dailyVolume.addUSDValue(Number(data.volumeUsd))
    dailyFees.addUSDValue(Number(data.feesUsd))

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Volume: "Sum of notional (size × price) across every trade event (open, close, add, reduce) executed on Hit One in the period.",
    Fees: "Gross fees paid by users: 1% of collateral on position open + 5% of realized profit on profitable closes.",
    UserFees: "Gross fees paid by users: 1% of collateral on position open + 5% of realized profit on profitable closes.",
    Revenue: "All the fees are revenue for the protocol.",
    ProtocolRevenue: "All the revenue goes to the protocol.",
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.MEGAETH],
    start: "2026-04-13",
    methodology,
}

export default adapter
