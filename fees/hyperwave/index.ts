import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getHwhlpRev } from "./hwhlp";


const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const hwhlpFees = await getHwhlpRev(options);
    dailyFees.addCGToken("usd-coin", hwhlpFees);

    return {
        dailyFees,
        dailyRevenue: '0',
        dailyProtocolRevenue: '0',
        dailySupplySideRevenue: dailyFees,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-06-06',
        },
    },
    allowNegativeValue: true, // PnL can be negative
    methodology: {
        Fees: "Yield generated from HLP vault",
        Revenue: "No Revenue for hyperwave protocol",
        ProtocolRevenue: "No Protocol share in revenue",
        SupplySideRevenue: "100% of yield paid to hwHLP holders"
    },
};

export default adapter;
