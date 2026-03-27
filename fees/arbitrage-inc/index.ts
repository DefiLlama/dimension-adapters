import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';

const fetch = async (options: FetchOptions) => {
    const fees = await addTokensReceived({
        options,
        target: FEE_RECEIVER,
    });

    const dailyFees = options.createBalances();
    dailyFees.add(fees, 'Developer Fees');

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "We track fees sent to the fee receiver address which represents the developer commission for every swap executed via our frontend integration.",
    Revenue: "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.",
    ProtocolRevenue: "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.",
};

const breakdownMethodology = {
    Fees: {
        'Developer Fees': "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.",
    },
    Revenue: {
        'Developer Fees': "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.",
    },
    ProtocolRevenue: {
        'Developer Fees': "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.",
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
