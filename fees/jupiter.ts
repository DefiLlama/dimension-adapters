import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { METRIC } from "../helpers/metrics"

// JUP buybacks are reported once, here: the JUP bought into the Litterbox, mostly by swaps signed by the collector
// 7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP and the RFQ sweeper 3rA996DAZe5G67HWbC4jdyYPLeNptLXuybtLnx6dvkxn.
// JUP sent out of the Litterbox for the 2025-11-25 burn is not counted again. Other Jupiter listings report all revenue
// as protocol revenue.
const JUP_LITTERBOX_ADDRESS = '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
const JUP_BUY_BACK_START_TIME = 1739750400; // 2025-02-17
export const jupBuybackRatioFromRevenue = (_timestamp: number) => 0;

async function getLitterboxBuybacks(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances()
  if (options.endTimestamp <= JUP_BUY_BACK_START_TIME) return dailyHoldersRevenue
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

  // JupLend
  BorrowInterest: 'JupLend Borrow Interests',
  InterestToLenders: 'JupLend Borrow Interests To Lenders',
  InterestToFluid: 'JupLend Borrow Interests To Fluid',
  InterestToJupiter: 'JupLend Borrow Interests To Jupiter',
  InterestToLendersAndPartners: 'JupLend Borrow Interests To Lenders And Partners',

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
  JupPerpsFeesToLPs: 'JupPerps Fees To Lps',
  JupPerpsFeesToLJupiter: 'JupPerps Fees To Jupiter',

  // jupSOL
  JupSOLStakingRewards: 'JupSOL Staking Rewards',
  JupSOLStakingRewardsToStakers: 'JupSOL Staking Rewards To Stakers',
  JupSOLDepositWithdrawFees: 'JupSOL Deposit/Withdraw Fees',

  // Prediction
  JupPredictionFees: 'Jup Prediction Fees',
  JupPredictionFeesToKalshi: 'Jup Prediction Fees to Kalshi',

  // Ape
  JupApeFees: 'Jup Ape Trading And Launching Fees',

  // DCA
  JupDCAFees: 'Jup DCA Trading Fees',
  JupTriggerV2Fees: 'Trigger V2 Fees',

  // Studio
  JupStudioFees: 'Jup Studio Trading Fees',
  JupStudioFeesToReferrals: 'Jup Studio Trading Fees To Referrals',
  JupStudioFeesToJupiter: 'Jup Studio Trading Fees To Jupiter',

  // JUP buy back
  TokenBuyBack: METRIC.TOKEN_BUY_BACK,
}

const fetch = async (options: FetchOptions) => {
  const feeAuthorityRows = JUPITER_FEE_AUTHORITIES.map((address) => `('${address}')`).join(',\n        ')
  const data: { amount_usd: number }[] = await queryAllium(`
    WITH addr_list AS (
      SELECT addr
      FROM (VALUES
        ${feeAuthorityRows}
      ) AS v(addr)
    )
    
    SELECT COALESCE(t.usd_amount, 0) AS amount_usd
    FROM solana.assets.transfers t
    WHERE t.to_address = '9hdBK7FUzv4NjZbtYfm39F5utJyFsmCwbF9Mow5Pr1sN'
      AND t.block_timestamp <= TIMESTAMP '2025-02-16 23:59:59'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')

    UNION ALL
    
    SELECT COALESCE(t.usd_amount, 0) AS amount_usd
    FROM solana.assets.transfers t
    WHERE t.from_address IN (SELECT addr FROM addr_list)
      AND t.to_address = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP'
      AND t.block_timestamp >= TIMESTAMP '2025-02-17 00:00:00'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  const ultraRevenue = data.reduce((sum, row) => sum + (row.amount_usd || 0), 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(ultraRevenue, JUPITER_METRICS.AggSwapFees);
  const dailyRevenue = dailyFees.clone(1);
  const dailyProtocolRevenue = dailyRevenue.clone(1);
  // Not subtracted from protocol revenue: the buybacks are funded by several Jupiter products, not this listing alone.
  const dailyHoldersRevenue = await getLitterboxBuybacks(options);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'Jupiter platform fees collected from Ultra mode swaps.',
  Revenue: 'Jupiter platform fees from Ultra aggregation service.',
  HoldersRevenue: 'JUP bought back into the Jupiter Litterbox from 2025-02-17 with revenue across Jupiter products, valued at the day\'s JUP price. Burns of that JUP are not counted again.',
  ProtocolRevenue: 'All platform fees go to the Jupiter treasury.',
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.AggSwapFees]: "Platform fees from swaps executed through Jupiter's /order endpoint in Ultra mode.",
  },
  Revenue: {
    [JUPITER_METRICS.AggSwapFees]: "100% of Jupiter platform fees from Ultra mode swaps.",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.AggSwapFees]: "Platform fees, all to the Jupiter treasury.",
  },
  HoldersRevenue: {
    [JUPITER_METRICS.TokenBuyBack]: "JUP bought back into the Jupiter Litterbox with revenue across Jupiter products, valued at the day's JUP price.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-01-03',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology
}

export default adapter;
