import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const SXBET_API = "https://api.prod.sx.bet/analytics"

// WSX buybacks ran Oct-Dec 2025; from 2026 the commission is swept to the treasury instead
const TREASURY_SWEEP_START = 1767225600 // 2026-01-01

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const volumeData = (await fetchURL(`${SXBET_API}/volume?interval=day&aggregate=false&startDate=${options.startOfDay}&endDate=${options.endTimestamp}`)).data;
    const dailyVolume = volumeData[0].usdVolume;

    const revenueData = (await fetchURL(`${SXBET_API}/revenue?interval=day&aggregate=false&startDate=${options.startOfDay}&endDate=${options.endTimestamp}`)).data;
    const dailyFees = revenueData[0].usdRevenue;

    const openInterestAtEnd = (await fetchURL(`${SXBET_API}/openInterest`)).data;

    const result: FetchResult = {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        openInterestAtEnd,
    }

    if (options.startOfDay < TREASURY_SWEEP_START) result.dailyHoldersRevenue = dailyFees;
    else result.dailyProtocolRevenue = dailyFees;

    return result;
}

const methodology = {
    Volume: "Total amount staked on bets matched each day. Every bet is funded by two people whose stakes are pooled into a single payout, so both stakes are counted — they are separate money, not the same money counted twice.",
    Fees: "SX Bet takes no commission on single bets. On parlays it takes 5% of the winner's profit, charged to whichever side wins — market makers pay it too when they win, and losing bets pay nothing. The exchange charged no commission at all between 29 February 2024 and 1 October 2025, and used an earlier fee schedule before that; both are reflected here as reported by the exchange.",
    Revenue: "Equal to fees. None of the commission is shared with market makers — they earn from the bets they win, not from a cut of the fee.",
    HoldersRevenue: "Through 2025 the collected commission was spent buying SX tokens on the open market.",
    ProtocolRevenue: "From January 2026 the collected commission is sent to the team's treasury instead of funding token buybacks.",
    OpenInterest: "Total amount staked on bets that have been matched but not yet settled. The exchange only publishes this as a current figure, so it reflects the latest snapshot rather than the state on a past date.",
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SXR],
    start: '2019-03-04',
    methodology,
};

export default adapter;
