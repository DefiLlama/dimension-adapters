import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"
import { getSolanaReceived } from "../helpers/token"
import { JUPITER_FEE_AUTHORITIES, JUPITER_METRICS, jupBuybackRatioFromRevenue } from "./jupiter";

const LEGACY_DCA_FEE_WALLET = 'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'

// Trigger V2 keeps orders off-chain and settles each fill as a plain Jupiter V6
// swap, so the keeper paying the network fee is the only on-chain identifier.
// Not to be confused with the gasless payer gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB.
const TRIGGER_V2_KEEPER = 'gasBidSWW5zmwXs3gn8TG2ijzKkrwpyM7ucwjgDQst6'
const TRIGGER_V2_START_TIMESTAMP = 1773100800 // 2026-03-10

async function getTriggerV2Fees(options: FetchOptions) {
  const fees = options.createBalances()
  if (options.endTimestamp <= TRIGGER_V2_START_TIMESTAMP) return fees

  const feeAuthorities = JUPITER_FEE_AUTHORITIES.map((address) => `'${address}'`).join(', ')
  // Half-open on purpose: the shared TIME_RANGE macro closes the upper bound,
  // which double counts the boundary second on an hourly adapter.
  const timeRange = (column: string) =>
    `${column} >= from_unixtime(${options.startTimestamp}) AND ${column} < from_unixtime(${options.endTimestamp})`

  const rows: { token: string; amount: string }[] = await queryDuneSql(options, `
    WITH keeper_transfers AS (
      SELECT tx_id, token_mint_address, amount, amount_display
      FROM tokens_solana.transfers
      WHERE ${timeRange('block_time')}
        AND tx_signer = '${TRIGGER_V2_KEEPER}'
    ),
    trigger_txs AS (
      SELECT DISTINCT tx_id FROM keeper_transfers
    ),
    -- account_activity is decimal adjusted, so recover the raw amount from the
    -- raw/display ratio of the same token in the same set of transactions.
    token_scale AS (
      SELECT token_mint_address, MAX(CAST(amount AS DOUBLE) / amount_display) AS scale
      FROM keeper_transfers
      WHERE amount_display > 0
      GROUP BY 1
    ),
    -- The fee authorities double as Jupiter's shared routing accounts, so swap
    -- volume passes through them. Only the net change per transaction is fee
    -- income; summing inbound transfers overstates it by orders of magnitude.
    fee_net AS (
      SELECT a.tx_id, a.token_mint_address AS mint, SUM(a.token_balance_change) AS net
      FROM solana.account_activity a
      JOIN trigger_txs t ON t.tx_id = a.tx_id
      WHERE ${timeRange('a.block_time')}
        AND a.tx_success
        AND a.token_mint_address IS NOT NULL
        AND a.token_balance_owner IN (${feeAuthorities})
      GROUP BY 1, 2
    )
    SELECT
      fee_net.mint AS token,
      CAST(SUM(fee_net.net) * MAX(token_scale.scale) AS DECIMAL(38, 0)) AS amount
    FROM fee_net
    JOIN token_scale ON token_scale.token_mint_address = fee_net.mint
    WHERE fee_net.net > 0
    GROUP BY 1
  `)

  rows.forEach(({ token, amount }) => fees.add(token, amount))
  return fees
}

const fetchFeesSolana = async (options: FetchOptions) => {
  const [legacyFees, triggerV2Fees] = await Promise.all([
    getSolanaReceived({ options, targets: [LEGACY_DCA_FEE_WALLET] }),
    getTriggerV2Fees(options),
  ])
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.add(legacyFees, JUPITER_METRICS.JupDCAFees);
  dailyFees.add(triggerV2Fees, JUPITER_METRICS.JupTriggerV2Fees);
  dailyRevenue.add(legacyFees, JUPITER_METRICS.JupDCAFees);
  dailyRevenue.add(triggerV2Fees, JUPITER_METRICS.JupTriggerV2Fees);

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  const revenueHolders = dailyRevenue.clone(buybackRatio);
  const revenueProtocol = dailyRevenue.clone(1 - buybackRatio);
  dailyProtocolRevenue.add(revenueProtocol);
  dailyHoldersRevenue.add(revenueHolders, JUPITER_METRICS.TokenBuyBack);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true,
  isExpensiveAdapter: true,
  // Legacy DCA fees come from Allium (unchanged), Trigger V2 fees from Dune.
  dependencies: [Dependencies.ALLIUM, Dependencies.DUNE],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFeesSolana,
      start: '2024-01-01',
    },
  },
  methodology: {
    Fees: 'Legacy DCA fees are measured from the dedicated DCA fee wallet. Trigger V2 fees are the net token balance increase of Jupiter fee authorities in swaps settled by the Trigger keeper.',
    Revenue: 'Legacy DCA fees and Trigger V2 fees collected by Jupiter. Trigger V2 fees are also part of the Jupiter aggregator adapter, hence this adapter is marked as double counted.',
    ProtocolRevenue: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
    HoldersRevenue: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupDCAFees]: 'Legacy DCA fees received by the dedicated DCA fee wallet.',
      [JUPITER_METRICS.JupTriggerV2Fees]: 'Trigger V2 fees, covering both recurring (DCA) and price/limit orders. Jupiter stores the order type off-chain, so the two cannot be separated on-chain.',
    },
    Revenue: {
      [JUPITER_METRICS.JupDCAFees]: 'Legacy DCA fees collected by Jupiter and JUP token holders.',
      [JUPITER_METRICS.JupTriggerV2Fees]: 'Trigger V2 fees collected by Jupiter. Overlaps with the aggregator swap fees.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupDCAFees]: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
      [JUPITER_METRICS.JupTriggerV2Fees]: 'Trigger V2 fees allocated to the Jupiter treasury after the token buyback share.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
    },
  }
}

export default adapter
