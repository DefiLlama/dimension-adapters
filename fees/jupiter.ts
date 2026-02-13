import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"
import { getSolanaReceivedDune } from "../helpers/token"
import { METRIC } from "../helpers/metrics"

interface IData {
  fee_usd: string;
}

// const JUP_LITTERBOX_ADDRESS = '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'

// 50% revenue will be used to buy back JUP start from 2025-02-17
const JUP_BUY_BACK_START_TIME = 1739750400;
export const jupBuybackRatioFromRevenue = (timestamp: number) => timestamp >= JUP_BUY_BACK_START_TIME ? 0.5 : 0;

export const JUPITER_METRICS = {
  // Aggregator
  AggSwapFees: 'Aggregator Swap Fees',
  LimitOrderFees: 'Limit Orders Fees',
  AggSwapFeesToIntergators: 'Aggregator Swap Fees To Integrators',
  AggSwapFeesToJupiter: 'Aggregator Swap Fees To Jupiter',
  
  // JupLend
  BorrowInterest: 'JupLend Borrow Interests',
  InterestToLenders: 'JupLend Borrow Interests To Lenders',
  InterestToFluid: 'JupLend Borrow Interests To Fluid',
  InterestToJupiter: 'JupLend Borrow Interests To Jupiter',
  
  // perps
  JupPerpsFees: 'JupPerps Trading Fees',
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
  // limit order fees
  const limitOrderFees = await getSolanaReceivedDune({
    options, targets: [
      'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu'
      , '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
    ]
  })

  // ultra fees
  // https://dune.com/queries/4769928
  const data: IData[] = await queryDuneSql(options, `
    WITH fee_instruction_calls AS (
      SELECT 
          tx_id
        , tx_signer
        , tx_success
        , block_time
        , block_slot
        , data
        , ROW_NUMBER() OVER (PARTITION BY tx_id ORDER BY outer_instruction_index ASC, COALESCE(inner_instruction_index,0) ASC) AS log_index
      FROM solana.instruction_calls
      WHERE executing_account = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
        AND bytearray_substring(data,1,8) = 0xe445a52e51cb9a1d
        AND bytearray_substring(data,1+8,8) = 0x494f4e7fb8d50ddc -- FeeEvent https://solscan.io/account/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4#anchorProgramIDL
        AND tx_success = true
        AND block_slot >= 316169420
    ), fees_v6 AS (
      SELECT
          tk.symbol
        , tk.decimals
        , toBase58(bytearray_substring(fic.data,1+16,32)) AS account
        , toBase58(bytearray_substring(fic.data,1+48,32)) AS mint
        , bytearray_to_bigint(bytearray_reverse(bytearray_substring(fic.data,1+80,8))) AS fee_amount
        , fic.block_slot
        , fic.block_time
        , fic.tx_id
        , fic.tx_signer
        , fic.log_index
        , 6 AS jup_version
      FROM fee_instruction_calls fic
        LEFT JOIN tokens_solana.fungible tk ON tk.token_mint_address = toBase58(bytearray_substring(fic.data,1+48,32))
      WHERE tk.symbol NOT IN ('ELISA','BEEF','ASDEX')
    )
        
    SELECT 
        DATE_TRUNC('day', t1.block_time) AS day
      , SUM(t1.fee_amount/pow(10,t1.decimals) * COALESCE(t2.price,0)) AS fee_usd
    FROM fees_v6 t1
    LEFT JOIN prices.usd t2
      ON t2.blockchain = 'solana' 
      AND toBase58(t2.contract_address) = t1.mint
      AND t2.minute = date_trunc('minute',t1.block_time)
    WHERE t1.fee_amount/pow(10,t1.decimals) * COALESCE(t2.price,0) < 1e7 --less than 1 million usd fee on a single trade
        and t1.block_time >= FROM_UNIXTIME(${options.startTimestamp})
        and t1.block_time < FROM_UNIXTIME(${options.endTimestamp})
        GROUP BY 1
  `);
  
  const feesUltra = options.createBalances()
  data.forEach((item) => {
    feesUltra.addUSDValue(item.fee_usd)
  })
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  dailyFees.add(limitOrderFees, JUPITER_METRICS.LimitOrderFees);
  dailyRevenue.add(limitOrderFees, JUPITER_METRICS.LimitOrderFees);
  dailyFees.add(feesUltra, JUPITER_METRICS.AggSwapFees);
  
  const feesUltraIntegrators = feesUltra.clone(0.8);
  const feesUltraJupiter = feesUltra.clone(0.2);
  
  dailySupplySideRevenue.add(feesUltraIntegrators, JUPITER_METRICS.AggSwapFeesToIntergators);
  dailyRevenue.add(feesUltraJupiter, JUPITER_METRICS.AggSwapFeesToJupiter);

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  const revenueHolders = feesUltraJupiter.clone(buybackRatio);
  const revenueProtocol = feesUltraJupiter.clone(1 - buybackRatio);
  dailyProtocolRevenue.add(revenueProtocol, JUPITER_METRICS.AggSwapFeesToJupiter);
  dailyHoldersRevenue.add(revenueHolders, JUPITER_METRICS.TokenBuyBack);
  
  // const query = `
  //   SELECT SUM(raw_amount) as total_amount
  //   FROM solana.assets.transfers
  //   WHERE to_address = '${JUP_LITTERBOX_ADDRESS}'
  //   AND mint = '${ADDRESSES.solana.JUP}'
  //   AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
  // `
  // const res = await queryAllium(query);
  // const dailyHoldersRevenue = options.createBalances();
  // dailyHoldersRevenue.add(ADDRESSES.solana.JUP, res[0].total_amount || 0);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2024-09-02',
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Trading fees paid by users.',
    Revenue: 'Portion of fees collected by protocol.',
    SupplySideRevenue: 'Fees share to integrators.',
    HoldersRevenue: 'Jup Buybacks from 50% of jupiter ecosystem protocol revenue start from 2025-02-17.',
    ProtocolRevenue: 'Jupiter collects 50% of jupiter ecosystem protocol revenue, it was 100% before 2025-02-17.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.LimitOrderFees]: "Fees collected from limit orders placed using the Jupiter Trigger API",
      [JUPITER_METRICS.AggSwapFees]: "Fees collected from swaps executed using Jupiter Ultra Swap API",
    },
    Revenue: {
      [JUPITER_METRICS.LimitOrderFees]: "The protocol collects all the fees from limit orders placed using the Jupiter Trigger API",
      [JUPITER_METRICS.AggSwapFeesToJupiter]: "The protocol collects 20% of the integrator fees",
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.AggSwapFeesToIntergators]: "Fees collected by protocols integrating the Jupiter Ultra Swap API.",
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.AggSwapFeesToJupiter]: "Jupiter collects 50% of jupiter ecosystem protocol revenue, it was 100% before 2025-02-17.",
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: "Jup Buybacks from 50% of jupiter ecosystem protocol revenue start from 2025-02-17.",
    },
  },
}

export default adapter
