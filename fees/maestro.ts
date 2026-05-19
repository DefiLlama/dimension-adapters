import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions, Dependencies, } from "../adapters/types";
import { getAlliumChain, queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";

const LABELS = {
  BOT_FEES: 'Trading fees paid by users',
  BOT_REVENUE: 'Trading fees excluding referral rewards',
  REFERRAL_FEES: 'Referral rewards',
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
    fetch: fetchSolana,
    start: '2024-03-05',
    feeAddresses: ['MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36', 'FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN'],
    // Maestro-funded wallet that relays SOL referral rewards to users.
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
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const chainKey = getAlliumChain(options.chain)
  const feeAddress = config.feeAddress!.toLowerCase()
  const rewardFundingSources = [config.feeAddress, config.dispatcher].filter(Boolean).map((address: string) => `'${address.toLowerCase()}'`).join(', ')
  const internalAddresses = Object.values(chainConfig).flatMap((config: any) => [config.feeAddress, config.dispatcher, config.rewardRelay]).filter((address: any) => address?.startsWith?.('0x')).map((address: string) => `'${address.toLowerCase()}'`).join(', ')
  const rewardsQuery = config.rewardRelay ? `
    SELECT COALESCE(SUM(raw_amount), 0) AS amount
    FROM ${chainKey}.assets.native_token_transfers
    WHERE to_address = '${config.rewardRelay.toLowerCase()}'
      AND from_address IN (${rewardFundingSources})
      AND transfer_type = 'value_transfer'
      AND raw_amount > 0
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  ` : 'SELECT 0 AS amount'

  const query = `
    SELECT
      (SELECT COALESCE(SUM(raw_amount), 0)
      FROM ${chainKey}.assets.native_token_transfers
      WHERE to_address = '${feeAddress}'
        AND from_address NOT IN (${internalAddresses})
        AND transfer_type = 'value_transfer'
        AND raw_amount > 0
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      ) AS fees,
      (SELECT amount FROM (${rewardsQuery})) AS referral_rewards
  `

  const result = (await queryAllium(query))[0]
  const revenue = (BigInt(result.fees ?? 0) - BigInt(result.referral_rewards ?? 0)).toString()

  dailyFees.addGasToken(result.fees, LABELS.BOT_FEES)
  dailyRevenue.addGasToken(revenue, LABELS.BOT_REVENUE)
  dailySupplySideRevenue.addGasToken(result.referral_rewards, LABELS.REFERRAL_FEES)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

async function fetchSolana(options: FetchOptions) {
  const config = chainConfig[CHAIN.SOLANA]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const feeAddresses = config.feeAddresses.map((address: string) => `'${address}'`).join(', ')
  const query = `
    SELECT
      (SELECT COALESCE(SUM(raw_amount), 0)
      FROM solana.assets.transfers
      WHERE to_address IN (${feeAddresses})
        AND from_address NOT IN (${feeAddresses})
        AND mint = '${ADDRESSES.solana.SOL}'
        AND transfer_type = 'sol_transfer'
        AND raw_amount > 0
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      ) AS fees,
      (SELECT COALESCE(SUM(raw_amount), 0)
      FROM solana.assets.transfers
      WHERE to_address = '${config.rewardRelay}'
        AND from_address IN (${feeAddresses})
        AND mint = '${ADDRESSES.solana.SOL}'
        AND transfer_type = 'sol_transfer'
        AND raw_amount > 0
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      ) AS referral_rewards
  `

  const result = (await queryAllium(query))[0]
  const revenue = (BigInt(result.fees ?? 0) - BigInt(result.referral_rewards ?? 0)).toString()

  dailyFees.add(ADDRESSES.solana.SOL, result.fees, LABELS.BOT_FEES)
  dailyRevenue.add(ADDRESSES.solana.SOL, revenue, LABELS.BOT_REVENUE)
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, result.referral_rewards, LABELS.REFERRAL_FEES)
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
    [LABELS.BOT_FEES]: "Trading fees paid by users while using Maestro bot.",
  },
  Revenue: {
    [LABELS.BOT_REVENUE]: "Trading fees kept by Maestro after referral rewards.",
  },
  ProtocolRevenue: {
    [LABELS.BOT_REVENUE]: "Trading fees kept by Maestro after referral rewards.",
  },
  SupplySideRevenue: {
    [LABELS.REFERRAL_FEES]: "Referral rewards paid to Maestro users.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
  allowNegativeValue: true,
  isExpensiveAdapter: true
}

export default adapter;
