import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

async function fetch(options: FetchOptions) {
    const aukiBurnt = await addTokensReceived({
        options,
        target: '0x0000000000000000000000000000000000000000',
        tokens: ['0xf9569cfb8fd265e91aa478d86ae8c78b8af55df4']
    });

    const dailyFees = aukiBurnt.clone(1, 'Credits Bought');
    const dailyRevenue = aukiBurnt.clone(1, 'AUKI Token Burns');

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue: dailyRevenue,
    }
}

const methodology = {
    Fees: "Auki tokens spent to buy credits to use across the network.",
    Revenue: "All the Auki tokens spent on credits are burnt",
    HoldersRevenue: "All the Auki tokens spent on credits are burnt",
}

const breakdownMethodology = {
    Fees: {
        'Credits Bought': "Auki tokens spent to buy credits to use across the network.",
    },
    Revenue: {
        'AUKI Token Burns': "All the Auki tokens spent on credits are burnt",
    },
    HoldersRevenue: {
        'AUKI Token Burns': "All the Auki tokens spent on credits are burnt",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: '2024-08-29',
    methodology,
    breakdownMethodology,
}

export default adapter;