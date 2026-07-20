import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const SXBET_API = "https://api.prod.sx.bet/analytics"

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const volumeData = (await fetchURL(`${SXBET_API}/volume?interval=day&aggregate=false&startDate=${options.startOfDay}&endDate=${options.endTimestamp}`)).data;
    const dailyVolume = volumeData[0].usdVolume;

    const revenueData = (await fetchURL(`${SXBET_API}/revenue?interval=day&aggregate=false&startDate=${options.startOfDay}&endDate=${options.endTimestamp}`)).data;
    const dailyFees = revenueData[0].usdRevenue;

    const openInterestAtEnd = (await fetchURL(`${SXBET_API}/openInterest`)).data;

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        openInterestAtEnd,
    }
}

const methodology = {
    Volume: "Total USD value of bets matched on the SX Bet exchange each day, from the protocol's public analytics API.",
    Fees: "SX Bet takes no commission on single bets and a 5% commission on the profit of winning parlays. This is the total commission collected that day; losing bets pay nothing.",
    Revenue: "Equal to fees — the protocol keeps the full parlay commission and pays none of it to market makers (they earn from the bets they win). This revenue was historically distributed to SX token stakers, but the SX token is being sunset (holder snapshot taken 15 May 2026).",
    OpenInterest: "Total USD value of open (unsettled) bet positions on the exchange at the end of the day.",
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SXR],
    start: '2019-03-04',
    methodology,
};

export default adapter;
