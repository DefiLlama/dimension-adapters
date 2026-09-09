import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { SWAP_EXECUTED, chains, start, getContracts } from "../../helpers/dashswallet";

const breakdownMethodology = {
    Fees: {
        "Swap Surplus": "Difference between actual swap output and the user's minimum accepted amount across DashsWallet swaps.",
    },
    Revenue: {
        "Swap Surplus To Treasury": "Portion of surplus retained by the DashsWallet treasury after deducting cashback.",
    },
    SupplySideRevenue: {
        "Swap Surplus Cashback To User": "Portion of surplus returned to the swap-initiating user as cashback.",
    },
    ProtocolRevenue: {
        "Swap Surplus To Treasury": "Portion of surplus retained by the DashsWallet treasury after deducting cashback (the treasury is the protocol; no holder split).",
    },
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const targets = await getContracts(options);

    const logs = await options.getLogs({
        targets,
        eventAbi: SWAP_EXECUTED,
        flatten: true,
    });

    for (const log of logs) {
        dailyFees.add(log.destToken, log.surplus, "Swap Surplus");
        dailyRevenue.add(log.destToken, log.protocolFee, "Swap Surplus To Treasury");
        dailyProtocolRevenue.add(log.destToken, log.protocolFee, "Swap Surplus To Treasury");
        dailySupplySideRevenue.add(log.destToken, log.cashback, "Swap Surplus Cashback To User");
    }

    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains,
    start,
    methodology: {
        Fees: "Total surplus captured on DashsWallet swaps — difference between actual swap output and the user's minimum accepted amount.",
        Revenue: "Portion of surplus retained by the DashsWallet treasury after deducting cashback.",
        ProtocolRevenue: "Portion of surplus retained by the DashsWallet treasury after deducting cashback (the treasury is the protocol; no holder split).",
        SupplySideRevenue: "Portion of surplus returned to the swap-initiating user as cashback.",
    },
    breakdownMethodology,
};

export default adapter;
