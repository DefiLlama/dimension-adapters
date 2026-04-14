import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { METRIC } from "../helpers/metrics"

// const JUP_LITTERBOX_ADDRESS = '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'

// 50% revenue will be used to buy back JUP start from 2025-02-17
const JUP_BUY_BACK_START_TIME = 1739750400;
export const jupBuybackRatioFromRevenue = (timestamp: number) => timestamp >= JUP_BUY_BACK_START_TIME ? 0.5 : 0;

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

  // Studio
  JupStudioFees: 'Jup Studio Trading Fees',
  JupStudioFeesToReferrals: 'Jup Studio Trading Fees To Referrals',
  JupStudioFeesToJupiter: 'Jup Studio Trading Fees To Jupiter',

  // JUP buy back
  TokenBuyBack: METRIC.TOKEN_BUY_BACK,
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: { amount_usd: number }[] = await queryAllium(`
    WITH addr_list AS (
      SELECT addr
      FROM (VALUES
        ('BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV'),
        ('2MFoS3MPtvyQ4Wh4M9pdfPjz6UhVoNbFbGJAskCPCj3h'),
        ('HU23r7UoZbqTUuh3vA7emAGztFtqwTeVips789vqxxBw'),
        ('3CgvbiM3op4vjrrjH2zcrQUwsqh5veNVRjFCB9N6sRoD'),
        ('6LXutJvKUw8Q5ue2gCgKHQdAN4suWW8awzFVC6XCguFx'),
        ('CapuXNQoDviLvU1PxFiizLgPNQCxrsag1uMeyk6zLVps'),
        ('GGztQqQ6pCPaJQnNpXBgELr5cs3WwDakRbh1iEMzjgSJ'),
        ('9nnLbotNTcUhvbrsA6Mdkx45Sm82G35zo28AqUvjExn8'),
        ('3LoAYHuSd7Gh8d7RTFnhvYtiTiefdZ5ByamU42vkzd76'),
        ('DSN3j1ykL3obAVNv7ZX49VsFCPe4LqzxHnmtLiPwY6xg'),
        ('69yhtoJR4JYPPABZcSNkzuqbaFbwHsCkja1sP1Q2aVT5'),
        ('6U91aKa8pmMxkJwBCfPTmUEfZi6dHe7DcFq2ALvB2tbB'),
        ('7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE'),
        ('4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZkdu71'),
        ('GP8StUXNYSZjPikyRsvkTbvRV1GBxMErb59cpeCJnDf1'),
        ('HFqp6ErWHY6Uzhj8rFyjYuDya2mXUpYEk8VW75K9PSiY'),
        ('6zQecXhjYTifDGYxbW7vRTQBrBYsi1Uac6BEJ4WzefWS'),
        ('GgY8theL9n9hQPoz2keQM8y6z8T6G6BH9FPLjBtkF9Hd'),
        ('G4FUwFD1h4tb4R6jkZXuoyst7YNbYTcJH3MvCUguss6E'),
        ('F2Xjd4ZJYz6SfszyUVGzLUzAHRRhfU2iJacCfW5GCJHM'),
        ('3cHRcBKWbJeL2qyjgQ8wdSYxmRYW1ZyC2nVqTakAj57G'),
        ('6Ugimjtgk7rk5SbZNzcYvZiM3P6ki4Uq3QGtTHWNn8co'),
        ('4QKRxAfawktf6szGUP456AqBvaKSnmuGy91QnqdBDSke'),
        ('9kiYqGSb1nbYMc5xxZQHhKvJR57LLAHVyDvSQ3FHjDPK')
      ) AS v(addr)
    )
    
    SELECT COALESCE(t.usd_amount, 0) AS amount_usd
    FROM solana.assets.transfers t
    WHERE t.to_address = '9hdBK7FUzv4NjZbtYfm39F5utJyFsmCwbF9Mow5Pr1sN'
      AND t.block_timestamp <= TIMESTAMP '2025-02-16 23:59:59'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')

    UNION ALL
    
    SELECT COALESCE(t.usd_amount, 0) AS amount_usd
    FROM solana.assets.transfers t
    WHERE t.from_address IN (SELECT addr FROM addr_list)
      AND t.to_address = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP'
      AND t.block_timestamp >= TIMESTAMP '2025-02-17 00:00:00'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  const ultraRevenue = data.reduce((sum, row) => sum + (row.amount_usd || 0), 0);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(ultraRevenue, JUPITER_METRICS.AggSwapFees);
  const dailyRevenue = dailyFees.clone(1);

  // Split protocol revenue between treasury and token buybacks
  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);

  // Ultra revenue split
  dailyProtocolRevenue.addBalances(dailyRevenue.clone(1 - buybackRatio));
  dailyHoldersRevenue.addBalances(dailyRevenue.clone(buybackRatio), JUPITER_METRICS.TokenBuyBack);

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
  HoldersRevenue: 'JUP token buybacks from 50% of platform revenue, started 2025-02-17.',
  ProtocolRevenue: 'Platform fees allocated to Jupiter treasury. 100% before 2025-02-17, 50% after.',
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.AggSwapFees]: "Platform fees from swaps executed through Jupiter's /order endpoint in Ultra mode.",
  },
  Revenue: {
    [JUPITER_METRICS.AggSwapFees]: "100% of Jupiter platform fees from Ultra mode swaps.",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.AggSwapFees]: "Platform fees allocated to Jupiter treasury: 100% before 2025-02-17, 50% after when token buyback program started.",
  },
  HoldersRevenue: {
    [JUPITER_METRICS.TokenBuyBack]: "Starting 2025-02-17, 50% of platform revenue is used to buy back JUP tokens, benefiting token holders.",
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
