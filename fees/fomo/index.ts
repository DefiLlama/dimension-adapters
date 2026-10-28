import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getSolanaReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const dataAvaliableTill = (Date.now() / 1e3 - 10 * 3600) // 10 hours ago

// first fee_period in dune.tryfomo.fomo_relay_fees_by_chain; from here on a day with no rows is missing data
const RELAY_FEES_START = '2025-12-09'

// networkId: Relay chain id where the cross-chain trade settled, as reported in fomo_relay_fees_by_chain.network_id
// Solana (null network_id) holds native USDC swap fees plus Relay fees FOMO could not attribute to a chain
const chainConfig: Record<string, { networkId: number | null; start: string }> = {
  [CHAIN.SOLANA]: { networkId: null, start: '2025-01-28' },
  [CHAIN.BASE]: { networkId: 8453, start: '2025-12-09' },
  [CHAIN.BSC]: { networkId: 56, start: '2025-12-09' },
  [CHAIN.MONAD]: { networkId: 143, start: '2025-12-09' },
  [CHAIN.ETHEREUM]: { networkId: 1, start: '2026-05-15' },
  [CHAIN.ROBINHOOD]: { networkId: 4663, start: '2026-07-09' },
  [CHAIN.ARC]: { networkId: 5042, start: '2026-09-15' },
}

const prefetch = async (options: FetchOptions) => {
  if (options.endTimestamp > dataAvaliableTill)
    throw new Error("Data not available till 10 hours ago. Please try a date before: " + new Date(dataAvaliableTill * 1e3).toISOString());

  const rows = await queryDuneSql(options, `
    WITH ranked AS (
      SELECT
        network_id,
        platform_fees,
        referral_fees,
        ROW_NUMBER() OVER (PARTITION BY fee_period, network_id ORDER BY synced_at DESC) AS rn
      FROM dune.tryfomo.fomo_relay_fees_by_chain
      WHERE fee_period >= from_unixtime(${options.startTimestamp})
        AND fee_period < from_unixtime(${options.endTimestamp})
    )
    SELECT network_id, SUM(platform_fees) AS platform_fees, SUM(referral_fees) AS referral_fees
    FROM ranked
    WHERE rn = 1
    GROUP BY network_id
  `);

  if (!rows.length && options.dateString >= RELAY_FEES_START)
    throw new Error(`No FOMO Relay fee rows for ${options.dateString}`);

  const known = Object.values(chainConfig).map(c => c.networkId)
  const unknown = rows.filter((r: any) => !known.includes(r.network_id))
  if (unknown.length)
    throw new Error(`Unmapped FOMO Relay network_id(s): ${unknown.map((r: any) => r.network_id).join(', ')}`);

  return rows
}

const fetch = async (options: FetchOptions) => {
  const { networkId } = chainConfig[options.chain]
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    const feesReceived = await getSolanaReceived({
      options,
      target: 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX',
      mints: [ADDRESSES.solana.USDC]
    })
    dailyFees.addBalances(feesReceived, METRIC.TRADING_FEES);
    dailyRevenue.addBalances(feesReceived, 'Trading Fees To Protocol');
  }

  const row = options.preFetchedResults.find((r: any) => r.network_id === networkId)
  if (row) {
    const platformFees = Number(row.platform_fees)
    const referralFees = Number(row.referral_fees)
    dailyFees.addUSDValue(platformFees + referralFees, METRIC.TRADING_FEES);
    dailyRevenue.addUSDValue(platformFees, 'Trading Fees To Protocol')
    dailySupplySideRevenue.addUSDValue(referralFees, 'Trading Fees To Referrers')
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "Trading fees paid by FOMO users. On Solana: USDC fees on native Solana swaps. On EVM chains: platform plus referral fees on cross-chain trades via Relay, attributed to the chain the trade settled on. Relay fees FOMO cannot attribute to a chain are counted on Solana.",
  },
  Revenue: {
    'Trading Fees To Protocol':
      "FOMO's share of trading fees: USDC collected on native Solana swaps plus Relay platform fees on the chain the trade settled on.",
  },
  ProtocolRevenue: {
    'Trading Fees To Protocol':
      "FOMO's share of trading fees, kept by the treasury.",
  },
  SupplySideRevenue: {
    'Trading Fees To Referrers':
      "Referral share of Relay trading fees, paid to referrers, on the chain the trade settled on.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  // volume (dexs/fomo) stays Solana-only: each trade is counted once where user balances are held
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees:
      "Trading fees paid by FOMO users on native Solana swaps and on cross-chain trades via Relay, attributed to the chain the trade settled on (Robinhood Chain, Base, BNB Chain, Ethereum, Arc, Monad). Relay fees FOMO cannot attribute to a chain are counted on Solana.",
    Revenue:
      "FOMO's share of trading fees: USDC collected on native Solana swaps plus Relay platform fees. Referral fees are excluded.",
    ProtocolRevenue:
      "FOMO keeps its share of trading fees in the treasury.",
    SupplySideRevenue:
      "Referral share of Relay trading fees, paid to referrers.",
  },
  breakdownMethodology
};

export default adapter;
