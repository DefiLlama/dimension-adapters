import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

// MineBTC Program: 1eotiTH2UxCpPMmtzUDGqf1b8dwM7AMKb8a2Tio51an
// SOL Casino roll fees are charged on gross bet size. Referral cuts, when
// present, are paid to per-user referral PDAs before the canonical vault split.
const SOL_TREASURY = "2TU3jP7vnhPD1ksVmSMQhuAauuFCuj9magtMWDW65jEx";
const STAKER_SOL_REWARD_VAULT = "FYnbbqMPUetvN22CDeDxAJb4SSXmqZcGEbrwVvoJREvK";

const TREASURY_BUYBACK_SHARE = 0.7;
const TREASURY_PROTOCOL_SHARE = 0.3;

const fetchFees = async (options: FetchOptions) => {
  if (!process.env.ALLIUM_API_KEY) {
    const empty = options.createBalances();

    return {
      dailyFees: empty,
      dailyUserFees: empty,
      dailyRevenue: empty,
      dailyProtocolRevenue: empty,
      dailyHoldersRevenue: empty,
      dailySupplySideRevenue: empty,
    };
  }

  const [treasuryReceipts, stakingRewardReceipts] = await Promise.all([
    getSolanaReceived({ options, target: SOL_TREASURY }),
    getSolanaReceived({ options, target: STAKER_SOL_REWARD_VAULT }),
  ]);

  const dailyHoldersRevenue = treasuryReceipts.clone(TREASURY_BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK);
  const dailyProtocolRevenue = treasuryReceipts.clone(TREASURY_PROTOCOL_SHARE, METRIC.PROTOCOL_FEES);
  const dailySupplySideRevenue = stakingRewardReceipts.clone(1, METRIC.STAKING_REWARDS);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyHoldersRevenue, METRIC.TOKEN_BUY_BACK);
  dailyRevenue.addBalances(dailyProtocolRevenue, METRIC.PROTOCOL_FEES);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyHoldersRevenue, "Casino Roll Fees");
  dailyFees.addBalances(dailyProtocolRevenue, "Casino Roll Fees");
  dailyFees.addBalances(dailySupplySideRevenue, "Casino Roll Fees");

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
  Fees: "SOL fees paid by users for MineBTC Casino rolls.",
  Revenue: "SOL received by the MineBTC treasury. The economy crank allocates this treasury flow between dBTC buybacks and protocol-side treasury / market-making flows.",
  ProtocolRevenue: "30% of treasury receipts retained for protocol-side treasury and market-making flows.",
  HoldersRevenue: "70% of treasury receipts allocated to dBTC buybacks, benefiting holders.",
  SupplySideRevenue: "SOL fees routed to the staking reward vault for dBTC and LP stakers.",
};

const breakdownMethodology = {
  Fees: {
    "Casino Roll Fees": "SOL fees paid by users for MineBTC Casino rolls.",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "70% of treasury receipts allocated to dBTC buybacks.",
    [METRIC.PROTOCOL_FEES]: "30% of treasury receipts retained for protocol-side treasury and market-making flows.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "30% of treasury receipts retained for protocol-side treasury and market-making flows.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "70% of treasury receipts allocated to dBTC buybacks.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "SOL fees routed to the staking reward vault for dBTC and LP stakers.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchFees,
  chains: [CHAIN.SOLANA],
  start: "2026-05-21",
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
