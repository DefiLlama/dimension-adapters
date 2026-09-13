import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getSolanaReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const dataAvaliableTill = (Date.now() / 1e3 - 10 * 3600) // 10 hours ago

const fetch = async (options: FetchOptions) => {
  if (options.endTimestamp > dataAvaliableTill) 
    throw new Error("Data not available till 10 hours ago. Please try a date before: " + new Date(dataAvaliableTill * 1e3).toISOString());

  const feesReceived = await getSolanaReceived({ 
    options, 
    target: 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX',
    mints: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']
  })
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addBalances(feesReceived, METRIC.TRADING_FEES);
  dailyRevenue.addBalances(feesReceived, METRIC.TRADING_FEES);

  const query = `
    WITH
    -- Off-chain relay fees (deduplicated)
    offchain_ranked AS (
      SELECT
        platform_fees,
        referral_fees,
        ROW_NUMBER() OVER (PARTITION BY fee_period ORDER BY synced_at DESC) AS rn
      FROM dune.tryfomo.fomo_relay_fees
      WHERE fee_period >= from_unixtime(${options.startTimestamp})
        AND fee_period < from_unixtime(${options.endTimestamp})
    ),

    offchain_total AS (
      SELECT 
        SUM(platform_fees) AS platform_fees,
        SUM(referral_fees) AS referral_fees
      FROM offchain_ranked
      WHERE rn = 1
    )

    SELECT
      COALESCE(offchain_total.platform_fees, 0) AS platform_fees,
      COALESCE(offchain_total.referral_fees, 0) AS referral_fees
    FROM offchain_total
  `;

  const fees = await queryDuneSql(options, query);
  const platformFees = Number(fees[0].platform_fees)
  const referralFees = Number(fees[0].referral_fees)
  dailyFees.addUSDValue(platformFees + referralFees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(platformFees, METRIC.TRADING_FEES)
  dailySupplySideRevenue.addUSDValue(referralFees, "Referral fees")

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "USDC trading fees on native Solana swaps plus trading fees on cross-chain trades via Relay. Fees that occur on Relay (EVM chains) are counted on Solana, where user balances are held.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]:
      "FOMO's share of trading fees: USDC collected on Solana plus Relay platform fees. Relay (EVM) fees are counted on Solana.",
  },
  SupplySideRevenue: {
    "Referral fees":
      "Referral share of Relay trading fees, paid to referrers. These fees occur on Relay (EVM chains) and are counted on Solana.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  start: '2025-01-28',
  isExpensiveAdapter: true,
  methodology: {
    Fees:
      "Trading fees paid by FOMO users on native Solana swaps and on cross-chain trades via Relay. Fees that occur on Relay (EVM chains) are counted on Solana, where user balances are held.",
    Revenue:
      "FOMO's share of trading fees: USDC collected on Solana plus Relay platform fees. Referral fees are excluded. Relay (EVM) fees are counted on Solana.",
    ProtocolRevenue:
      "FOMO keeps its share of trading fees in the treasury. Relay (EVM) fees are counted on Solana.",
    SupplySideRevenue:
      "Referral share of Relay trading fees, paid to referrers. These fees occur on Relay (EVM chains) and are counted on Solana.",
  },
  breakdownMethodology
};

export default adapter;