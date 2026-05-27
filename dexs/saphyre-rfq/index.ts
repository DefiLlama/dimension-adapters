import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://rfq.saphyre.xyz";

const fetch = async (_t: any, _b: any, options: FetchOptions) => {
    const res = await httpGet(`${API_BASE}/api/v1/analytics/volume?period=all&chain_id=1329`);

    const todaysPoint = res.data_points.find((p: any) => p.timestamp === options.startOfDay);
    if (!todaysPoint) {
        throw new Error(`No data found for date ${options.dateString}`);
    }

    const dailyVolume = todaysPoint.volume;
    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(todaysPoint.fees, 'Taker Fees');

    return {
        dailyVolume,
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

const breakdownMethodology = {
    Fees: {
        'Taker Fees': "Fees deducted from taker input amount on each RFQ swap.",
    },
    UserFees: {
        'Taker Fees': "Fees deducted from taker input amount on each RFQ swap.",
    },
    Revenue: {
        'Taker Fees': "Fees deducted from taker input amount on each RFQ swap.",
    },
    ProtocolRevenue: {
        'Taker Fees': "Fees deducted from taker input amount on each RFQ swap.",
    },
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SEI],
    start: "2026-04-07",
    methodology,
    breakdownMethodology,
};

export default adapter;
