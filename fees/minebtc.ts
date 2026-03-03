import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

// MineBTC Program: Hw9uxvtmQdS57N6aNwJA5iqjSqzhRDdopCHgm8EPwkqx
// Fee structure: 10% protocol fee on all SOL bets
//   - 1% -> staker SOL rewards vault (supply-side)
//   - 9% -> SOL treasury, further split:
//       - 80% (7.2% of bets) -> dogeBTC buybacks (holders)
//       - 20% (1.8% of bets) -> team multisig (protocol)
const SOL_TREASURY = "6rBKBaVK2m8rGjHXa65ohjWjD3B3VGDSKUpJrxraPmX1";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    // SOL treasury receives 9% of all bets placed (the other 1% goes to staker vault)
    const dailyRevenue = await getSolanaReceived({ options, target: SOL_TREASURY });

    // Total protocol fees = 10% of bets; treasury = 9/10 of that
    const dailyFees = dailyRevenue.clone(10 / 9);

    // Supply-side: staker SOL rewards = 1% of bets = 1/9 of treasury inflow
    const dailySupplySideRevenue = dailyRevenue.clone(1 / 9);

    // Protocol revenue: 20% of treasury -> team multisig
    const dailyProtocolRevenue = dailyRevenue.clone(0.2);

    // Holders revenue: 80% of treasury -> dogeBTC buybacks
    const dailyHoldersRevenue = dailyRevenue.clone(0.8);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "10% protocol fee on all SOL bets placed in MineBTC faction warfare rounds.",
    Revenue: "9% of bets flow to the protocol treasury for buybacks and team earnings.",
    ProtocolRevenue: "20% of treasury (1.8% of total bets) distributed to team multisig as dev earnings.",
    HoldersRevenue: "80% of treasury (7.2% of total bets) used for dogeBTC token buybacks, benefiting holders.",
    SupplySideRevenue: "1% of bets distributed as SOL staking rewards to dogeBTC and LP stakers of the winning faction.",
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2025-12-16",
    methodology,
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
};

export default adapter;