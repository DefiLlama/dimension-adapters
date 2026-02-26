import {CHAIN} from "../../helpers/chains";
import {FetchOptions} from "../../adapters/types";
import {httpGet} from "../../utils/fetchURL";

const NEW_FEES_DATE_1 = 20487

const fetch = async (_: number, _block: any, {startOfDayId, chain}: FetchOptions) => {
    const {
        volumeUSD,
        feesUSD
    } = await httpGet(`https://api-b.metropolis.exchange/api/v1/defilama/daily-stats/${chain}/${startOfDayId}`)
    const feeDailyProtocolRevenue: number = Number.parseInt(startOfDayId || "0") >= NEW_FEES_DATE_1 ? 0 : 0.05
    const feeDailyHoldersRevenue: number = Number.parseInt(startOfDayId || "0") >= NEW_FEES_DATE_1 ? 0.2 : 0.15

    const dailyVolume = +volumeUSD
    const dailyFees = +feesUSD
    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees * 0.2,
        dailyProtocolRevenue: dailyFees * feeDailyProtocolRevenue,
        dailySupplySideRevenue: dailyFees * 0.8,
        dailyHoldersRevenue: dailyFees * feeDailyHoldersRevenue,
    }
};

// https://docs.metropolis.exchange/protocol/or-pools-and-farms/or-dlmm-lb
const methodology = {
    Fees: "Swap fees",
    Revenue: "20% of the swap fees",
    ProtocolRevenue: "0% of the swap fees",
    SupplySideRevenue: "80% of the swap fees",
    HoldersRevenue: "20% of the swap fees",
};

export default {
    fetch,
    start: "2024-12-16",
    chains: [CHAIN.SONIC],
    methodology,
}
