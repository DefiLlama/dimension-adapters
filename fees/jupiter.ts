import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { queryDuneResult, queryDuneSql } from "../helpers/dune"
import { METRIC } from "../helpers/metrics"
import { getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../helpers/jupiter-stats"

// JUP buybacks. Since 2025-02-17 Jupiter spends 50% of its revenue across all products on JUP, which is held in the
// Litterbox Trust wallet (https://docs.jup.ag/user-docs/more/jup-token/faq). Holders revenue is the JUP received by
// that wallet each day, measured on-chain instead of the former flat 50% of each listing's revenue, and reported once,
// on this listing, so the Jupiter parent does not double count it.
// Senders: the revenue collector 7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP (hourly swaps), the RFQ sweeper
// 3rA996DAZe5G67HWbC4jdyYPLeNptLXuybtLnx6dvkxn, platform fees already paid in JUP forwarded from the fee authorities
// below (Feb to May 2025), and the first bulk buy on 2025-02-25: 3.1M USDC left the Litterbox, was swapped to 4.49M JUP
// and sent back, e.g. tx 65jKkr5Yw42LRD3BQW7MeBQwGzCZ2A7ijGS61An3T6msMhz7N5mvA79XFypw9r2q45QkMrWpqTMSC4m9D9fCoAhQ.
// Outflows are ignored, so the 134.5M JUP moved out on 2025-11-24 to be burned is not counted twice.
const JUP_LITTERBOX_ADDRESS = '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
const JUP_BUY_BACK_START_TIME = 1739750400; // 2025-02-17, first JUP into the Litterbox
// Share of revenue kept by the treasury (protocol revenue) on the products that fund the Litterbox (Aggregator, JupiterZ,
// Limit, DCA, Perps): all of it before 2025-02-17, half since,
// when the other half started buying back JUP (counted once, on this listing, as holders revenue).
export const jupTreasuryShare = (timestamp: number) => timestamp >= JUP_BUY_BACK_START_TIME ? 0.5 : 1;

// Saved Dune query running helpers/queries/jupiter-aggregator.sql: Litterbox buybacks per day since 2025-02-17,
// so refills skip the Allium query below. Rerun it on Dune to extend the history; days not in its result use Allium.
const DUNE_HISTORY_QUERY_ID = '9087823'

type CachedDay = { buyback_jup: string }
async function getCachedDay(options: FetchOptions): Promise<CachedDay | undefined> {
  if (options.startOfDay < JUP_BUY_BACK_START_TIME) return
  const [row] = await queryDuneResult(options, DUNE_HISTORY_QUERY_ID, `day = '${options.dateString}'`)
  return row as CachedDay | undefined
}

async function getLitterboxBuybacks(options: FetchOptions, cached?: CachedDay) {
  const dailyHoldersRevenue = options.createBalances()
  if (options.endTimestamp <= JUP_BUY_BACK_START_TIME) return dailyHoldersRevenue
  if (cached) {
    dailyHoldersRevenue.add(JUP_MINT, cached.buyback_jup, METRIC.TOKEN_BUY_BACK)
    return dailyHoldersRevenue
  }
  const [row] = await queryAllium(`
    SELECT
      (SELECT COALESCE(SUM(t.raw_amount), 0)
        FROM solana.assets.transfers t
        WHERE t.to_address = '${JUP_LITTERBOX_ADDRESS}'
          AND t.from_address != '${JUP_LITTERBOX_ADDRESS}'
          AND t.mint = '${JUP_MINT}'
          AND t.type IN ('transfer', 'transferChecked')
          AND t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})) AS amount,
      (SELECT MIN(block_timestamp)
        FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed_past_end
  `)
  if (!row) throw new Error(`Litterbox buybacks: no Allium result for ${options.dateString}`)
  if (!row.indexed_past_end) throw new Error(`Litterbox buybacks: Allium is not indexed through ${options.dateString} yet`)
  dailyHoldersRevenue.add(JUP_MINT, row.amount, METRIC.TOKEN_BUY_BACK)
  return dailyHoldersRevenue
}

// Jupiter program authorities that accumulate Swap V2 fees before they are
// swept to the central revenue wallet. Exported so product adapters can use
// the same canonical set when attributing a subset of aggregator fees.
export const JUPITER_FEE_AUTHORITIES = [
  'BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV',
  '2MFoS3MPtvyQ4Wh4M9pdfPjz6UhVoNbFbGJAskCPCj3h',
  'HU23r7UoZbqTUuh3vA7emAGztFtqwTeVips789vqxxBw',
  '3CgvbiM3op4vjrrjH2zcrQUwsqh5veNVRjFCB9N6sRoD',
  '6LXutJvKUw8Q5ue2gCgKHQdAN4suWW8awzFVC6XCguFx',
  'CapuXNQoDviLvU1PxFiizLgPNQCxrsag1uMeyk6zLVps',
  'GGztQqQ6pCPaJQnNpXBgELr5cs3WwDakRbh1iEMzjgSJ',
  '9nnLbotNTcUhvbrsA6Mdkx45Sm82G35zo28AqUvjExn8',
  '3LoAYHuSd7Gh8d7RTFnhvYtiTiefdZ5ByamU42vkzd76',
  'DSN3j1ykL3obAVNv7ZX49VsFCPe4LqzxHnmtLiPwY6xg',
  '69yhtoJR4JYPPABZcSNkzuqbaFbwHsCkja1sP1Q2aVT5',
  '6U91aKa8pmMxkJwBCfPTmUEfZi6dHe7DcFq2ALvB2tbB',
  '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE',
  '4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZkdu71',
  'GP8StUXNYSZjPikyRsvkTbvRV1GBxMErb59cpeCJnDf1',
  'HFqp6ErWHY6Uzhj8rFyjYuDya2mXUpYEk8VW75K9PSiY',
  '6zQecXhjYTifDGYxbW7vRTQBrBYsi1Uac6BEJ4WzefWS',
  'GgY8theL9n9hQPoz2keQM8y6z8T6G6BH9FPLjBtkF9Hd',
  'G4FUwFD1h4tb4R6jkZXuoyst7YNbYTcJH3MvCUguss6E',
  'F2Xjd4ZJYz6SfszyUVGzLUzAHRRhfU2iJacCfW5GCJHM',
  '3cHRcBKWbJeL2qyjgQ8wdSYxmRYW1ZyC2nVqTakAj57G',
  '6Ugimjtgk7rk5SbZNzcYvZiM3P6ki4Uq3QGtTHWNn8co',
  '4QKRxAfawktf6szGUP456AqBvaKSnmuGy91QnqdBDSke',
  '9kiYqGSb1nbYMc5xxZQHhKvJR57LLAHVyDvSQ3FHjDPK',
]

export const JUPITER_METRICS = {
  // Aggregator
  AggSwapFees: 'Aggregator Swap Fees',
  LimitOrderV1Fees: 'Limit Orders v1 Fees',
  LimitOrderV2Fees: 'Limit Orders v2 Fees',
  AggSwapFeesToIntergators: 'Aggregator Swap Fees To Integrators',
  AggSwapFeesToJupiter: 'Aggregator Swap Fees To Jupiter',
  JupiterZFees: 'JupiterZ Fees',

  // JupLend
  BorrowInterest: 'JupLend Borrow Interests',
  InterestToLenders: 'JupLend Borrow Interests To Lenders',
  InterestToFluid: 'JupLend Borrow Interests To Fluid',
  InterestToJupiter: 'JupLend Borrow Interests To Jupiter',

  // perps
  JupPerpsFees: 'JupPerps Trading Fees',
  JupPerpsAddLiquidityFees: 'JupPerps Add Liquidity Fees',
  JupPerpsRemoveLiquidityFees: 'JupPerps Remove Liquidity Fees',
  JupPerpsSwapFees: 'JupPerps Swap Fees',
  JupPerpsOpenPositionFees: 'JupPerps Open Position Fees',
  JupPerpsClosePositionFees: 'JupPerps Close Position Fees',
  JupPerpsLiquidationFees: 'JupPerps Liquidation Fees',
  JupPerpsFundingFees: 'JupPerps Funding Fees',
  JupPerpsPriceImpactFees: 'JupPerps Price Impact Fees',
  JupPerpsStakingRewards: 'JupPerps SOL Staking Rewards',
  JupPerpsLoanInterest: 'JupPerps JLP Loans Interest',
  JupPerpsFeesToLPs: 'JupPerps Fees To Lps',
  JupPerpsFeesToLJupiter: 'JupPerps Fees To Jupiter',

  // jupSOL
  JupSOLStakingRewards: 'JupSOL Staking Rewards',
  JupSOLStakingRewardsToStakers: 'JupSOL Staking Rewards To Stakers',
  JupSOLDepositWithdrawFees: 'JupSOL Deposit/Withdraw Fees',
  JupSOLMevRewards: 'JupSOL MEV Rewards',
  JupSOLValidatorPriorityFees: 'JupSOL Validator Priority Fees',
  JupSOLStakingRewardsToSanctum: 'JupSOL Staking Rewards To Sanctum',
  JupSOLValidatorCommission: 'JupSOL Validator Commission',

  // Prediction
  JupPredictionFees: 'Jup Prediction Fees',
  JupPredictionFeesToJupiter: 'Jup Prediction Fees To Jupiter',
  JupPredictionFeesToVenues: 'Jup Prediction Fees To Venues',

  // Ape
  JupApeFees: 'Jup Ape Trading And Launching Fees',

  // DCA
  JupDCAFees: 'Jup DCA Trading Fees',

  // Studio
  JupStudioFees: 'Jup Studio Trading Fees',
  JupStudioFeesToReferrals: 'Jup Studio Trading Fees To Referrals',
  JupStudioFeesToJupiter: 'Jup Studio Trading Fees To Jupiter',

  // JUP buy back
  TokenBuyBack: METRIC.TOKEN_BUY_BACK,
}

// Before 2025-02-17 platform fees were paid straight into 9hdBK7FUzv4NjZbtYfm39F5utJyFsmCwbF9Mow5Pr1sN.
async function getLegacyFeesUsd(options: FetchOptions) {
  const data: { amount_usd: number }[] = await queryAllium(`
    SELECT COALESCE(t.usd_amount, 0) AS amount_usd
    FROM solana.assets.transfers t
    WHERE t.to_address = '9hdBK7FUzv4NjZbtYfm39F5utJyFsmCwbF9Mow5Pr1sN'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `)
  return data.reduce((sum, row) => sum + (row.amount_usd || 0), 0)
}

// Jupiter Mobile swap fees land in its own collector from 2026-09-15 (in the fee authorities before), in native SOL,
// wSOL (token account ADKKyzoY8MUtPAMgjuBkuc9Y3BmZaTueeGkbMo7CVrdg) and SPL tokens.
const MOBILE_COLLECTOR = '6Gfahmxqn1VfJE1rZ3JsDZdztUKMc4F8bjR9pfu1XhWZ'
const MOBILE_COLLECTOR_START = 1789430400 // 2026-09-15
// Jupiter's share of positive slippage lands here from 2026-08-17 06:19 UTC (in the fee authorities before).
const SLIPPAGE_COLLECTOR = 'sobLmyY3kjTYqk2r7Ui18PC6YzHUBDaD2tk6PPNAv4o'
const SLIPPAGE_COLLECTOR_START = 1786924800 // 2026-08-17
// Keepers whose order fills also pay into the fee authorities; those fees are counted on the Jupiter Limit and Jupiter DCA listings.
const JUPITER_LIMIT_KEEPER = 'gasAx5Y917MYdmdnwiomwYDhmDKNGDJnN1MmEbxVdVw' // first fill 2025-10-02
const JUPITER_DCA_KEEPER = 'gasBidSWW5zmwXs3gn8TG2ijzKkrwpyM7ucwjgDQst6' // first fill 2026-03-25
// Signers whose transactions are not swap fees: the Baskets keeper (from 2026-11), sweeps and fee conversions by the
// revenue collector and the Mobile collector, and a 6,250 wSOL Pump cashback on 2026-08-30.
const EXCLUDED_SIGNERS = [
  'gasCZBUg3Bh3Cakv5mAWQxkgAeRSEqn6ThD9Gnppih4',
  '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP',
  MOBILE_COLLECTOR,
  '63THnNJix4sy75MNAZ5uSQWAtTDGiWHQsbntbmxmj6jZ',
]

// Fees read at swap time since 2025-02-17: the positive token balance change of every account owned by a fee wallet,
// per transaction. A fee authority is also an intermediate hop on routed swaps, and its balance nets to zero there.
// Fees in tokens without a Dune price are left out, as Jupiter does. Returns USD per product, split by the signer.
// Used up to 2025-12-31; it also covers 2026 (within a few percent of the stats API) if the API is ever dropped.
export async function getJupiterFeeAuthorityFees(options: FetchOptions): Promise<Record<string, number>> {
  const wallets = [...JUPITER_FEE_AUTHORITIES]
  if (options.startOfDay >= SLIPPAGE_COLLECTOR_START) wallets.push(SLIPPAGE_COLLECTOR)
  const mobile = options.startOfDay >= MOBILE_COLLECTOR_START
  if (mobile) wallets.push(MOBILE_COLLECTOR)
  const signers = [JUPITER_LIMIT_KEEPER, JUPITER_DCA_KEEPER, ...EXCLUDED_SIGNERS]
  const list = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ')
  const rows = await queryDuneSql(options, `
    WITH aa AS (
      SELECT tx_id, address, signed, token_mint_address, token_balance_change, balance_change
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND ((token_balance_owner IN (${list(wallets)}) AND token_balance_change > 0)
          ${mobile ? `OR (address = '${MOBILE_COLLECTOR}' AND balance_change > 0 AND NOT signed)` : ''}
          OR (signed AND address IN (${list(signers)})))
    ),
    signer AS (
      SELECT tx_id, MAX(CASE address WHEN '${JUPITER_LIMIT_KEEPER}' THEN 'limit' WHEN '${JUPITER_DCA_KEEPER}' THEN 'dca' ELSE 'excluded' END) AS product
      FROM aa
      WHERE signed AND address IN (${list(signers)})
      GROUP BY 1
    ),
    received AS (
      SELECT tx_id, token_mint_address AS mint, token_balance_change AS amount FROM aa WHERE token_balance_change > 0
      UNION ALL
      -- native SOL into the Mobile collector
      SELECT tx_id, 'So11111111111111111111111111111111111111112', balance_change / 1e9 FROM aa
      WHERE address = '${MOBILE_COLLECTOR}' AND balance_change > 0 AND NOT signed
    )
    SELECT COALESCE(s.product, 'aggregator') AS product, SUM(r.amount * p.price) AS fees_usd
    FROM received r
    LEFT JOIN signer s ON s.tx_id = r.tx_id
    LEFT JOIN prices.day p ON p.blockchain = 'solana'
      AND p.timestamp = from_unixtime(${options.startOfDay})
      AND p.contract_address_varchar = r.mint
    GROUP BY 1
  `)
  const fees = Object.fromEntries(rows.map((row: any) => [row.product, Number(row.fees_usd)]))
  if (!fees.aggregator) throw new Error(`Jupiter fee authorities: no fees on Dune for ${options.dateString}`)
  return fees
}

// From 2026-01-01, Jupiter's stats API, including swaps made in Jupiter Mobile and the Jupiter Extension.
const getFeesUsd = async (options: FetchOptions) => {
  if (options.startOfDay < JUP_BUY_BACK_START_TIME) return getLegacyFeesUsd(options)
  if (options.startOfDay < JUPITER_STATS_API_START_TS) return (await getJupiterFeeAuthorityFees(options)).aggregator
  const { dailyFees } = await getJupiterStatsRevenue(options, { aggregator: JUPITER_METRICS.AggSwapFees })
  return dailyFees.getUSDValue()
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(await getFeesUsd(options), JUPITER_METRICS.AggSwapFees)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees.clone(jupTreasuryShare(options.startOfDay)),
    dailyHoldersRevenue: await getLitterboxBuybacks(options, await getCachedDay(options)),
  }
}

const methodology = {
  Fees: 'Jupiter platform fees on swaps routed through Jupiter, including Jupiter Mobile and its share of positive slippage. Excludes limit order and DCA fills, counted on the Jupiter Limit and Jupiter DCA listings.',
  Revenue: 'All Jupiter platform fees on swaps, kept by Jupiter.',
  HoldersRevenue: 'JUP bought back into the Jupiter Litterbox wallet since 2025-02-17, funded with 50% of Aggregator, JupiterZ, Limit, DCA and Perps revenue and reported once, on this listing.',
  ProtocolRevenue: 'Half of platform fees, kept by the treasury. The other half buys back JUP, counted here as holders revenue.',
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.AggSwapFees]: "Platform fees on swaps routed through Jupiter, including Jupiter Mobile and its share of positive slippage, excluding limit order and DCA fills.",
  },
  Revenue: {
    [JUPITER_METRICS.AggSwapFees]: "All platform fees on swaps, kept by Jupiter.",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.AggSwapFees]: "Half of platform fees on swaps, kept by the treasury.",
  },
  HoldersRevenue: {
    [JUPITER_METRICS.TokenBuyBack]: "JUP bought back into the Jupiter Litterbox wallet with 50% of Aggregator, JupiterZ, Limit, DCA and Perps revenue.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-01-03',
  dependencies: [Dependencies.ALLIUM, Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology
}

export default adapter;
