import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://rfq.saphyre.xyz";

const fetch = async (_t: any, _b: any, { startOfDay }: any) => {
    const res = await httpGet(`${API_BASE}/api/v1/analytics/volume?period=all&chain_id=1329`);
    const point = res.data_points.find((p: any) => p.timestamp === startOfDay);
    const dailyFees = point?.fees ?? 0;
    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "Trading fees deducted from taker input amount on each RFQ swap.",
    UserFees: "Fees paid by takers on each swap.",
    Revenue: "All fees are protocol revenue (no LPs in RFQ model).",
    ProtocolRevenue: "All fees go to the protocol fee treasury.",
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SEI]: { fetch, start: "2025-03-01" },
    },
    methodology,
};

export default adapter;
