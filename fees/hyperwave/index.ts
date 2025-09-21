import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { appendHwhlpRev } from "./hwhlp";
import { appendHwhypeRev } from "./hwhype";


const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const hwhlpAppendedFees = await appendHwhlpRev(options, dailyFees);
    const hwhypeAppendedFees = await appendHwhypeRev(options, hwhlpAppendedFees);

    return {        
        dailyFees: hwhypeAppendedFees,
        dailyRevenue: '0',
        dailyProtocolRevenue: '0',
        dailySupplySideRevenue: hwhypeAppendedFees,
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
        Fees: "Yield generated from HLP and hwHYPE vault",
        Revenue: "No Revenue for Hyperwave protocol",
        ProtocolRevenue: "No Protocol share in revenue",
        SupplySideRevenue: "100% of yield paid to hwHLP and hwHYPE holders"
    },
};

export default adapter;
