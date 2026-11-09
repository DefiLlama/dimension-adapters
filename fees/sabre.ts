import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";

// Sabre (t.me/sabrex_bot) Solana Telegram trading bot.
// Platform fee (currently 0.4%) on every buy/sell swap is sent directly to this wallet.
const FEE_WALLET = "7EGhZWjtN7S9EtuQisALPwiMu8TnsbtKM9CbNGJRX25A";
// Referral rewards are paid out from the fee wallet to this wallet.
const REFERRAL_WALLET = "EnDqft6H2HPimWKAd5ueAh8YaYuonMWfkc6Yog9yCjA4";

const LABELS = {
  BOT_REVENUE: "Sabre trading fees excluding referral rewards",
  REFERRAL_REWARDS: "Referral rewards",
};

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH data AS (
      SELECT
        COALESCE(SUM(CASE WHEN to_address = '${FEE_WALLET}' AND from_address != '${REFERRAL_WALLET}' THEN raw_amount ELSE 0 END), 0) AS fees,
        COALESCE(SUM(CASE WHEN from_address = '${FEE_WALLET}' AND to_address = '${REFERRAL_WALLET}' THEN raw_amount ELSE 0 END), 0) AS referral_rewards
      FROM solana.assets.transfers
      WHERE mint = '${ADDRESSES.solana.SOL}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND (
          to_address = '${FEE_WALLET}'
          OR (from_address = '${FEE_WALLET}' AND to_address = '${REFERRAL_WALLET}')
        )
    )
    SELECT fees, referral_rewards FROM data
  `;

  const result = (await queryAllium(query))[0];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(ADDRESSES.solana.SOL, result.fees, METRIC.TRADING_FEES);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, result.referral_rewards, LABELS.REFERRAL_REWARDS);
  dailyRevenue.add(ADDRESSES.solana.SOL, result.fees, LABELS.BOT_REVENUE);
  dailyRevenue.subtract(dailySupplySideRevenue, LABELS.BOT_REVENUE);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Platform fee paid by users on every buy/sell swap executed through the Sabre Telegram bot.",
  Revenue: "Trading fees kept by Sabre after referral rewards are paid out.",
  ProtocolRevenue: "Trading fees kept by Sabre after referral rewards are paid out.",
  SupplySideRevenue: "Referral rewards funded from the Sabre fee wallet and sent to the referral rewards wallet.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "SOL sent to the Sabre fee wallet for every executed swap (currently 0.4% of trade size).",
  },
  Revenue: {
    [LABELS.BOT_REVENUE]: "SOL fees retained by Sabre after referral rewards.",
  },
  ProtocolRevenue: {
    [LABELS.BOT_REVENUE]: "SOL fees retained by Sabre after referral rewards.",
  },
  SupplySideRevenue: {
    [LABELS.REFERRAL_REWARDS]: "Referral rewards paid out in SOL from the fee wallet to referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-07-24',
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
