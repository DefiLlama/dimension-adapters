import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions, Dependencies, } from "../adapters/types";
import { getAlliumChain, queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

// Wallets are from personal research findings, not Maestro team docs.
// verfied based on the memo as 'maestro referral' in tx

const LABELS = {
  BOT_REVENUE: 'Trading fees excluding referral rewards',
  REWARDS: 'Referral rewards',
}

// const TONFeeAddress = 'TXNP92LYmnPZzqnXwwsmotizTcNyPGxxEv'
const chainConfig: any = {
  [CHAIN.ETHEREUM]: { start: '2022-07-01', feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397', dispatcher: '0x2ff99ee6b22aedaefd8fd12497e504b18983cb14', rewardRelay: '0x5314A41f27BFe2fDe86CCd4B6f08c398Be538D8f' },
  [CHAIN.BSC]: { start: '2022-07-01', feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397', dispatcher: '0x7176456e98443a7000b44e09149a540d06733965', rewardRelay: '0x5314A41f27BFe2fDe86CCd4B6f08c398Be538D8f' },
  [CHAIN.ARBITRUM]: { start: '2022-07-01', feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397', dispatcher: '0x34b5561c30a152b5882c8924973f19df698470f4', rewardRelay: '0x5314A41f27BFe2fDe86CCd4B6f08c398Be538D8f' },
  [CHAIN.BASE]: { start: '2024-06-19', feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397', dispatcher: '0x2CDF4CAdF2272B77475732446Ba664443277E8C1', rewardRelay: '0x5314A41f27BFe2fDe86CCd4B6f08c398Be538D8f' },
  [CHAIN.SONIC]: { start: '2025-02-26', feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397' },
  [CHAIN.AVAX]: { start: '2025-06-08', feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397' },
  [CHAIN.SOLANA]: {
    start: '2024-03-05',
    feeAddresses: ['MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36', 'FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN'],
    // Reward relay memo: MaestroReferral.
    rewardRelay: 'BNuebGMyAsrLytsS13whc3qUqbnM9mVwUJcumD31m5zA',
  },
  // [CHAIN.TRON]: {
  //   start: '2022-07-01',
  //   feeAddress: '0xB0999731f7c2581844658A9d2ced1be0077b7397',
  //   dispatcher: '0xeabcabB91FC7191ecc2002FAc9e269C96d914BAB',
  // },
  // [CHAIN.HYPERLIQUID]: { start: '2025-05-27' },
}

async function fetchEVM(options: FetchOptions) {
  const config = chainConfig[options.chain]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const chainKey = getAlliumChain(options.chain)
  const feeAddress = config.feeAddress!.toLowerCase()
  const rewardFundingSources = [config.feeAddress, config.dispatcher].filter(Boolean).map((address: string) => `'${address.toLowerCase()}'`).join(', ')
  const internalAddresses = Object.values(chainConfig).flatMap((config: any) => [config.feeAddress, config.dispatcher, config.rewardRelay]).filter((address: any) => address?.startsWith?.('0x')).map((address: string) => `'${address.toLowerCase()}'`).join(', ')
  const rewardFilter = config.rewardRelay ? `OR (to_address = '${config.rewardRelay.toLowerCase()}' AND from_address IN (${rewardFundingSources}))` : ''

  const query = `
    WITH data AS (
      SELECT
      COALESCE(SUM(CASE WHEN to_address = '${feeAddress}' AND from_address NOT IN (${internalAddresses}) THEN TRY_TO_DECIMAL(raw_amount_str, 38, 0) ELSE 0 END), 0) AS fees,
      COALESCE(SUM(CASE WHEN ${config.rewardRelay ? `to_address = '${config.rewardRelay.toLowerCase()}' AND from_address IN (${rewardFundingSources})` : 'FALSE'} THEN TRY_TO_DECIMAL(raw_amount_str, 38, 0) ELSE 0 END), 0) AS referral_rewards
      FROM ${chainKey}.assets.native_token_transfers
      WHERE transfer_type = 'value_transfer'
        AND raw_amount > 0
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND (to_address = '${feeAddress}' ${rewardFilter})
    )
    SELECT TO_VARCHAR(fees) AS fees, TO_VARCHAR(referral_rewards) AS referral_rewards, TO_VARCHAR(fees - referral_rewards) AS revenue FROM data
  `

  const result = (await queryAllium(query))[0]

  dailyFees.addGasToken(result.fees, METRIC.TRADING_FEES)
  dailyRevenue.addGasToken(result.revenue, LABELS.BOT_REVENUE)
  dailySupplySideRevenue.addGasToken(result.referral_rewards, LABELS.REWARDS)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

async function fetchSolana(options: FetchOptions) {
  const config = chainConfig[CHAIN.SOLANA]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const feeAddresses = config.feeAddresses.map((address: string) => `'${address}'`).join(', ')
  const query = `
    WITH data AS (
      SELECT
      COALESCE(SUM(CASE WHEN to_address IN (${feeAddresses}) AND from_address NOT IN (${feeAddresses}) THEN TRY_TO_DECIMAL(raw_amount_str, 38, 0) ELSE 0 END), 0) AS fees,
      COALESCE(SUM(CASE WHEN to_address = '${config.rewardRelay}' AND from_address IN (${feeAddresses}) THEN TRY_TO_DECIMAL(raw_amount_str, 38, 0) ELSE 0 END), 0) AS referral_rewards
      FROM solana.assets.transfers
      WHERE mint = '${ADDRESSES.solana.SOL}'
        AND transfer_type = 'sol_transfer'
        AND raw_amount > 0
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND (to_address IN (${feeAddresses}) OR to_address = '${config.rewardRelay}')
    )
    SELECT TO_VARCHAR(fees) AS fees, TO_VARCHAR(referral_rewards) AS referral_rewards, TO_VARCHAR(fees - referral_rewards) AS revenue FROM data
  `

  const result = (await queryAllium(query))[0]

  dailyFees.add(ADDRESSES.solana.SOL, result.fees, METRIC.TRADING_FEES)
  dailyRevenue.add(ADDRESSES.solana.SOL, result.revenue, LABELS.BOT_REVENUE)
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, result.referral_rewards, LABELS.REWARDS)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
} 

async function fetch(options: FetchOptions) {
  return options.chain === CHAIN.SOLANA ? fetchSolana(options) : fetchEVM(options)
}

const methodology = {
  Fees: "All trading fees paid by users while using Maestro bot.",
  Revenue: "Trading fees kept by Maestro protocol after referral rewards.",
  ProtocolRevenue: "Trading fees kept by Maestro protocol after referral rewards.",
  SupplySideRevenue: "Referral rewards paid to Maestro users.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users while using Maestro bot.",
  },
  Revenue: {
    [LABELS.BOT_REVENUE]: "Trading fees kept by Maestro after referral rewards.",
  },
  ProtocolRevenue: {
    [LABELS.BOT_REVENUE]: "Trading fees kept by Maestro after referral rewards.",
  },
  SupplySideRevenue: {
    [LABELS.REWARDS]: "Referral rewards paid to Maestro users.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
  allowNegativeValue: true,
  isExpensiveAdapter: true
}

export default adapter;
