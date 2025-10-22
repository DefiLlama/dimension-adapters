import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getHwhlpFees } from "./hwhlp";
import { getHwhypeHwusdFees } from "./hwhype";

const fetch = async (options: FetchOptions) => {
    const hwhlpFees = await getHwhlpFees(options);
    const { dailyFees: hwhypeFees, dailyRevenue } = await getHwhypeHwusdFees(
        options
    );

    const dailyFees = options.createBalances();
    dailyFees.addBalances(hwhlpFees);
    dailyFees.addBalances(hwhypeFees);

    return {
        dailyFees,
        dailySupplySideRevenue: dailyFees,
        dailyRevenue: dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: "2025-06-06",
        },
    },
    allowNegativeValue: true, // PnL can be negative
    methodology: {
        Fees: "Yields generated from HLP and hwHYPE vaults.",
        Revenue:
            "Yields collected by protocol as revenue, currently, no revenue.",
        ProtocolRevenue:
            "Revenue share for protocol, currently no revenue share for Hyperwave protocol.",
        SupplySideRevenue:
            "Currewntly, 100% of yields paid to hwHLP and hwHYPE holders, suppliers.",
    },
};

export default adapter;
