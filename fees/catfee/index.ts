import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { sumTronscanTrxTransfers } from "../../helpers/tron";

const CONFIG = {
    CATFEE_ADDRESS: "TCatFee7NWfcD7nD372Udn49H5ok8rYy6Q",
    START_TIMESTAMP: 1735210273,
} as const;

async function fetch({ createBalances, endTimestamp, fromTimestamp }: FetchOptions) {
    const dailyFees = createBalances();
    const totalFees = await sumTronscanTrxTransfers({ address: CONFIG.CATFEE_ADDRESS, fromTimestamp, endTimestamp });
    dailyFees.addCGToken('tron', totalFees, 'Buying Energy');

    return {
        dailyFees,
        dailySupplySideRevenue: dailyFees,
        dailyRevenue: 0, // catfee takes no comission or fees
    };
}

export default {
    methodology: {
        Fees: "All fees paid by users for buying energy.",
        SupplySideRevenue: "All fees are distributed to supply side TRX stakers.",
        Revenue: "No revenue for protocol.",
    },
    breakdownMethodology: {
        Fees: {
            'Buying Energy': 'All fees paid by users for buying energy.',
        },
        SupplySideRevenue: {
            'Buying Energy': 'All fees are distributed to supply side TRX stakers.',
        },
        Revenue: {
            'Buying Energy': 'No revenue for protocol.',
        },
    },
    version: 2,
    fetch,
    chains: [CHAIN.TRON],
    start: CONFIG.START_TIMESTAMP,
    pullHourly: true,
};
