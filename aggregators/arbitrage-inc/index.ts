import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
const FEE_RATE = 0.001;

const fetch = async (options: FetchOptions) => {
    const dailyFees = await addTokensReceived({
        options,
        targets: [FEE_RECEIVER],
    });

    const dailyVolume = dailyFees.clone(1 / FEE_RATE);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailyVolume,
    };
};

const DEV_FEE_DESC = "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.";

const methodology = {
    Fees: "We track fees sent to the fee receiver address which represents the developer commission for every swap executed via our frontend integration.",
    Revenue: DEV_FEE_DESC,
    ProtocolRevenue: DEV_FEE_DESC,
    Volume: "Amount of trades executed on the Arbitrage Inc platform",
};

const breakdownMethodology = {
    Fees: {
        'Developer Fees': DEV_FEE_DESC,
    },
    Revenue: {
        'Developer Fees': DEV_FEE_DESC,
    },
    ProtocolRevenue: {
        'Developer Fees': DEV_FEE_DESC,
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BSC],
    fetch,
    start: '2026-03-23',
    methodology,
    breakdownMethodology,
};

export default adapter;
