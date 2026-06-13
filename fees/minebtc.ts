import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

// MineBTC Program (Old): Hw9uxvtmQdS57N6aNwJA5iqjSqzhRDdopCHgm8EPwkqx
// Fee structure: 10% protocol fee on all SOL bets
//   - 1% -> staker SOL rewards vault (supply-side)
//   - 9% -> SOL treasury, further split:
//       - 80% (7.2% of bets) -> dogeBTC buybacks (holders)
//       - 20% (1.8% of bets) -> team multisig (protocol)
const SOL_TREASURY_OLD = "6rBKBaVK2m8rGjHXa65ohjWjD3B3VGDSKUpJrxraPmX1";

// MineBTC Program (New): 1eotiTH2UxCpPMmtzUDGqf1b8dwM7AMKb8a2Tio51an
// SOL Casino roll fees are charged on gross bet size. Referral cuts, when
// present, are paid to per-user referral PDAs before the canonical vault split.
const SOL_TREASURY_NEW = "2TU3jP7vnhPD1ksVmSMQhuAauuFCuj9magtMWDW65jEx";
const STAKER_SOL_REWARD_VAULT = "FYnbbqMPUetvN22CDeDxAJb4SSXmqZcGEbrwVvoJREvK";

const TREASURY_BUYBACK_SHARE = 0.7;
const TREASURY_PROTOCOL_SHARE = 0.3;
const CASINO_ROLL_FEES = "Casino Roll Fees";
const CASINO_ROLL_FEES_TO_BUYBACKS = "Casino Roll Fees To Buybacks";
const CASINO_ROLL_FEES_TO_TREASURY = "Casino Roll Fees To Treasury";
const CASINO_ROLL_FEES_TO_STAKERS = "Casino Roll Fees To Stakers";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    if (options.startTimestamp <= 1779192000) {
        // SOL treasury receives 9% of all bets placed (the other 1% goes to staker vault)
        const treasuryReceipts = await getSolanaReceived({ options, target: SOL_TREASURY_OLD });

        // Holders revenue: 80% of treasury -> dogeBTC buybacks
        dailyHoldersRevenue.addBalances(treasuryReceipts.clone(0.8, CASINO_ROLL_FEES_TO_BUYBACKS));
        // Protocol revenue: 20% of treasury -> team multisig
        dailyProtocolRevenue.addBalances(treasuryReceipts.clone(0.2, CASINO_ROLL_FEES_TO_TREASURY));
        // Supply-side: staker SOL rewards = 1% of bets = 1/9 of treasury inflow
        dailySupplySideRevenue.addBalances(treasuryReceipts.clone(1 / 9, CASINO_ROLL_FEES_TO_STAKERS));

        dailyRevenue.addBalances(dailyHoldersRevenue, CASINO_ROLL_FEES_TO_BUYBACKS);
        dailyRevenue.addBalances(dailyProtocolRevenue, CASINO_ROLL_FEES_TO_TREASURY);

        // Total protocol fees = 10% of bets = treasury (10/9) = buybacks + team + stakers
        dailyFees.addBalances(dailyHoldersRevenue, CASINO_ROLL_FEES);
        dailyFees.addBalances(dailyProtocolRevenue, CASINO_ROLL_FEES);
        dailyFees.addBalances(dailySupplySideRevenue, CASINO_ROLL_FEES);
    }
    else {
      const treasuryReceipts = await getSolanaReceived({ options, target: SOL_TREASURY_NEW, mints: [ADDRESSES.solana.SOL] });
      const stakingRewardReceipts = await getSolanaReceived({ options, target: STAKER_SOL_REWARD_VAULT, mints: [ADDRESSES.solana.SOL] });

      dailyHoldersRevenue.addBalances(treasuryReceipts.clone(TREASURY_BUYBACK_SHARE, CASINO_ROLL_FEES_TO_BUYBACKS));
      dailyProtocolRevenue.addBalances(treasuryReceipts.clone(TREASURY_PROTOCOL_SHARE, CASINO_ROLL_FEES_TO_TREASURY));
      dailySupplySideRevenue.addBalances(stakingRewardReceipts.clone(1, CASINO_ROLL_FEES_TO_STAKERS));

      dailyRevenue.addBalances(dailyHoldersRevenue, CASINO_ROLL_FEES_TO_BUYBACKS);
      dailyRevenue.addBalances(dailyProtocolRevenue, CASINO_ROLL_FEES_TO_TREASURY);

      dailyFees.addBalances(dailyHoldersRevenue, CASINO_ROLL_FEES);
      dailyFees.addBalances(dailyProtocolRevenue, CASINO_ROLL_FEES);
      dailyFees.addBalances(dailySupplySideRevenue, CASINO_ROLL_FEES);
    }
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
    Fees: "SOL fees paid by users on MineBTC bets. The original deployment charged a 10% protocol fee on all SOL bets placed in faction warfare rounds; the current deployment charges SOL Casino roll fees on gross bet size.",
    Revenue: "SOL received by the MineBTC treasury (9% of bets on the original deployment), split between dogeBTC/dBTC buybacks and protocol-side treasury / market-making flows.",
    ProtocolRevenue: "Treasury share retained for the team / protocol-side treasury and market-making (20% of treasury on the original deployment, 30% on the current one).",
    HoldersRevenue: "Treasury share used for dogeBTC/dBTC token buybacks, benefiting holders (80% of treasury on the original deployment, 70% on the current one).",
    SupplySideRevenue: "SOL staking rewards routed to the staking reward vault for dogeBTC/dBTC and LP stakers (1% of bets on the original deployment).",
}

const breakdownMethodology = {
    Fees: {
        [CASINO_ROLL_FEES]: "SOL fees paid by users for MineBTC bets / Casino rolls.",
    },
    Revenue: {
        [CASINO_ROLL_FEES_TO_BUYBACKS]: "Treasury share allocated to dogeBTC/dBTC buybacks (80% of treasury on the original deployment, 70% on the current one).",
        [CASINO_ROLL_FEES_TO_TREASURY]: "Treasury share retained for protocol-side treasury and market-making flows (20% of treasury on the original deployment, 30% on the current one).",
    },
    ProtocolRevenue: {
        [CASINO_ROLL_FEES_TO_TREASURY]: "Treasury share retained for protocol-side treasury and market-making flows (20% of treasury on the original deployment, 30% on the current one).",
    },
    HoldersRevenue: {
        [CASINO_ROLL_FEES_TO_BUYBACKS]: "Treasury share allocated to dogeBTC/dBTC buybacks (80% of treasury on the original deployment, 70% on the current one).",
    },
    SupplySideRevenue: {
        [CASINO_ROLL_FEES_TO_STAKERS]: "SOL fees routed to the staking reward vault for dogeBTC/dBTC and LP stakers.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2025-12-16",
    methodology,
    breakdownMethodology,
    dependencies: [Dependencies.ALLIUM],
};

export default adapter;