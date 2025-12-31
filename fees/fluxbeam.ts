import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const FEE_VAULTS = [
    'FLUXR4McuD2iXyP3wpP4XTjSWmB86ppMiyoA52UA9bKb',
    '4RNnWnJeyy6myqFW4anPDJtmhnZTdSMDo2HWjfBiDcLc',
];

const fetch = async (options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({ 
        options, 
        targets: FEE_VAULTS 
    })

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    dependencies: [Dependencies.ALLIUM],
    adapter: {
        [CHAIN.SOLANA]: {   
            fetch,
            start: '2024-01-01',
        },
    },
    methodology: {
        Fees: 'Fees collected by FluxBeam fee vaults',
        Revenue: 'All fees collected by the protocol'
    },
    isExpensiveAdapter: true,
};

export default adapter;