import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const LABELS = {
  TERMINAL_REVENUE: "Trading fees excluding referral or cashback rewards",
  REWARDS: "Referral or cashback rewards",
};

const chainConfig: Record<string, { start: string; feeWallet: string; rewardWallet: string }> = {
  [CHAIN.SOLANA]: {
    start: "2025-08-12",
    feeWallet: "FBYmU5XbRgX2DV2i2SpPPpHpXmf6mdZS98wQChmUyMba",
    rewardWallet: "84DGj4Qpypcaa5uxdzphYzkutEUTvxLWSuWq3BoJLxkp",
  },
};

async function fetch(options: FetchOptions) {
  const { feeWallet, rewardWallet } = chainConfig[options.chain];
  const query = `
    WITH
    walletActivity AS (
      SELECT
        tx_id,
        SUM(CASE WHEN address = '${feeWallet}' AND balance_change > 0 THEN balance_change ELSE 0 END) AS fee_lamports,
        SUM(CASE WHEN address = '${rewardWallet}' AND balance_change > 0 THEN balance_change ELSE 0 END) AS reward_lamports,
        MAX(CASE WHEN address = '${feeWallet}' THEN 1 ELSE 0 END) AS fee_wallet_rows
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND token_mint_address IS NULL
        AND address IN ('${feeWallet}', '${rewardWallet}')
      GROUP BY 1
    ),
    rewardPayouts AS (
      SELECT
        COALESCE(SUM(reward_lamports), 0) AS reward_lamports
      FROM walletActivity
      WHERE fee_wallet_rows > 0
    ),
    botTrades AS (
      SELECT tx_id
      FROM dex_solana.trades
      WHERE TIME_RANGE
        AND trader_id = '${feeWallet}'
      GROUP BY 1
    )
    SELECT
      CAST(COALESCE(SUM(CASE WHEN botTrades.tx_id IS NULL THEN fee_lamports ELSE 0 END), 0) AS VARCHAR) AS fees,
      CAST((SELECT reward_lamports FROM rewardPayouts) AS VARCHAR) AS cashback_rewards
    FROM walletActivity
    LEFT JOIN botTrades ON walletActivity.tx_id = botTrades.tx_id
  `;

  const [result] = await queryDuneSql(options, query);
  const fees = result?.fees ?? 0;
  const cashbackRewards = result?.cashback_rewards ?? 0;
  const revenue = (BigInt(fees) - BigInt(cashbackRewards)).toString();

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(ADDRESSES.solana.SOL, fees, METRIC.TRADING_FEES);
  dailyRevenue.add(ADDRESSES.solana.SOL, revenue, LABELS.TERMINAL_REVENUE);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, cashbackRewards, LABELS.REWARDS);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "All SOL inflows to Telemetry's main fee wallet.",
  UserFees: "All SOL inflows to Telemetry's main fee wallet.",
  Revenue: "Trading fees kept by Telemetry after referral or cashback rewards paid from the fee wallet.",
  ProtocolRevenue: "Trading fees kept by Telemetry after referral or cashback rewards paid from the fee wallet.",
  SupplySideRevenue: "SOL referral or cashback rewards paid from Telemetry's rewards account.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "All SOL inflows to Telemetry's fee wallet.",
  },
  Revenue: {
    [LABELS.TERMINAL_REVENUE]: "Trading fees retained by Telemetry after referral or cashback rewards.",
  },
  ProtocolRevenue: {
    [LABELS.TERMINAL_REVENUE]: "Trading fees retained by Telemetry after referral or cashback rewards.",
  },
  SupplySideRevenue: {
    [LABELS.REWARDS]: "SOL referral or cashback rewards paid from Telemetry's rewards account.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
