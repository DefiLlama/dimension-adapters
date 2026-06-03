import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getSolanaReceived } from "../helpers/token";

// MineBTC Program: 1eotiTH2UxCpPMmtzUDGqf1b8dwM7AMKb8a2Tio51an
// SOL Casino roll fees are charged on gross bet size. Referral cuts, when
// present, are paid to per-user referral PDAs before the canonical vault split.
const SOL_TREASURY = "2TU3jP7vnhPD1ksVmSMQhuAauuFCuj9magtMWDW65jEx";
const STAKER_SOL_REWARD_VAULT = "FYnbbqMPUetvN22CDeDxAJb4SSXmqZcGEbrwVvoJREvK";

const TREASURY_BUYBACK_SHARE = 0.7;
const TREASURY_PROTOCOL_SHARE = 0.3;
const CASINO_ROLL_FEES = "Casino Roll Fees";
const CASINO_ROLL_FEES_TO_BUYBACKS = "Casino Roll Fees To Buybacks";
const CASINO_ROLL_FEES_TO_TREASURY = "Casino Roll Fees To Treasury";
const CASINO_ROLL_FEES_TO_STAKERS = "Casino Roll Fees To Stakers";

const fetch = async (options: FetchOptions) => {
  const treasuryReceipts = await getSolanaReceived({ options, target: SOL_TREASURY, mints: [ADDRESSES.solana.SOL] });
  const stakingRewardReceipts = await getSolanaReceived({ options, target: STAKER_SOL_REWARD_VAULT, mints: [ADDRESSES.solana.SOL] });

  const dailyHoldersRevenue = treasuryReceipts.clone(TREASURY_BUYBACK_SHARE, CASINO_ROLL_FEES_TO_BUYBACKS);
  const dailyProtocolRevenue = treasuryReceipts.clone(TREASURY_PROTOCOL_SHARE, CASINO_ROLL_FEES_TO_TREASURY);
  const dailySupplySideRevenue = stakingRewardReceipts.clone(1, CASINO_ROLL_FEES_TO_STAKERS);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyHoldersRevenue, CASINO_ROLL_FEES_TO_BUYBACKS);
  dailyRevenue.addBalances(dailyProtocolRevenue, CASINO_ROLL_FEES_TO_TREASURY);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyHoldersRevenue, CASINO_ROLL_FEES);
  dailyFees.addBalances(dailyProtocolRevenue, CASINO_ROLL_FEES);
  dailyFees.addBalances(dailySupplySideRevenue, CASINO_ROLL_FEES);

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
    [CASINO_ROLL_FEES]: "SOL fees paid by users for MineBTC Casino rolls.",
  },
  Revenue: {
    [CASINO_ROLL_FEES_TO_BUYBACKS]: "70% of treasury receipts allocated to dBTC buybacks.",
    [CASINO_ROLL_FEES_TO_TREASURY]: "30% of treasury receipts retained for protocol-side treasury and market-making flows.",
  },
  ProtocolRevenue: {
    [CASINO_ROLL_FEES_TO_TREASURY]: "30% of treasury receipts retained for protocol-side treasury and market-making flows.",
  },
  HoldersRevenue: {
    [CASINO_ROLL_FEES_TO_BUYBACKS]: "70% of treasury receipts allocated to dBTC buybacks.",
  },
  SupplySideRevenue: {
    [CASINO_ROLL_FEES_TO_STAKERS]: "SOL fees routed to the staking reward vault for dBTC and LP stakers.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-21",
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
