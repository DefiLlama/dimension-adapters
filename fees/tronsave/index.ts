import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { sumTronscanTrxTransfers } from "../../helpers/tron";

const CONFIG = {
    TRON_SAVE_ADDRESS: "TWZEhq5JuUVvGtutNgnRBATbF8BnHGyn4S",
    START_TIMESTAMP: 1687938910,
} as const;

async function fetch({ createBalances, endTimestamp, fromTimestamp }: FetchOptions) {
    const dailyRevenue = createBalances();
    const totalRevenue = await sumTronscanTrxTransfers({ address: CONFIG.TRON_SAVE_ADDRESS, fromTimestamp, endTimestamp });
    dailyRevenue.addCGToken('tron', totalRevenue);

    return {
        dailyFees: dailyRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

export default {
    methodology: {
        Fees: "All fees paid by users for buying energy.",
        Revenue: "All fees are collected by TronSave protocol.",
        ProtocolRevenue: "All fees are collected by TronSave protocol.",
    },
    version: 2,
    adapter: {
        [CHAIN.TRON]: {
            fetch,
            start: CONFIG.START_TIMESTAMP,
        },
    },
    pullHourly: true,
};
