import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryAllium } from '../../helpers/allium'

// DFlow Prediction Markets on Solana (powered by Kalshi CLP)
// Program: pReDicTmksnPfkfiz33ndSdbe2dY43KYPg4U2dbvHvb
//
// Collateral tokens:
// - CASH (CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH): Primary collateral, pegged to $1
// - USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v): Alternative collateral
//
// Key addresses (from transaction analysis):
// - CASH Settlement Vault Owner: AgfNbTUmTK75HcpDCsuTDarj2iapJCbNSr2pzcCXRBS
// - USDC Settlement Vault Owner: 6k797rx8d5xUBsfCgp7LDrsvvnnxjKf2MjQkx6kvdPDw
// - Fee Account: 8psNvWTrdNTiVRNzAgsou9kETXNJm2SXZyaKuJraVRtf
//
// Note: CASH token doesn't have proper USD pricing in Dune, so we use raw amount / 1e6

const CASH_TOKEN = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH'
const USDC_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const FEE_ACCOUNT = '8psNvWTrdNTiVRNzAgsou9kETXNJm2SXZyaKuJraVRtf'
const CASH_SETTLEMENT_VAULT = 'AgfNbTUmTK75HcpDCsuTDarj2iapJCbNSr2pzcCXRBS'
const USDC_SETTLEMENT_VAULT = '6k797rx8d5xUBsfCgp7LDrsvvnnxjKf2MjQkx6kvdPDw'
const DFLOW_PREDICTION_PROGRAM = 'pReDicTmksnPfkfiz33ndSdbe2dY43KYPg4U2dbvHvb'

async function fetch(options: FetchOptions): Promise<FetchResult> {
  // Volume = transfers TO settlement vault owners (consumed_input_amount in FillUserOrder)
  // Fees = transfers TO fee account (platform_fee_amount)
  const query = `
    WITH prediction_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${DFLOW_PREDICTION_PROGRAM}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    transfers AS (
      SELECT
        t.mint,
        t.to_address,
        t.raw_amount,
        t.usd_amount
      FROM solana.assets.transfers t
      INNER JOIN prediction_txs p ON t.txn_id = p.txn_id
      WHERE t.mint IN ('${CASH_TOKEN}', '${USDC_TOKEN}')
        AND t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )
    SELECT
      -- Fees: transfers to fee account
      COALESCE(SUM(CASE
        WHEN to_address = '${FEE_ACCOUNT}' AND mint = '${CASH_TOKEN}' THEN raw_amount / 1e6
        WHEN to_address = '${FEE_ACCOUNT}' AND mint = '${USDC_TOKEN}' THEN usd_amount
        ELSE 0
      END), 0) as fees,
      -- Volume: transfers to settlement vault owners only (the actual trade value)
      COALESCE(SUM(CASE
        WHEN to_address = '${CASH_SETTLEMENT_VAULT}' AND mint = '${CASH_TOKEN}' THEN raw_amount / 1e6
        WHEN to_address = '${USDC_SETTLEMENT_VAULT}' AND mint = '${USDC_TOKEN}' THEN usd_amount
        ELSE 0
      END), 0) as volume
    FROM transfers
  `

  const result = await queryAllium(query)

  const dailyFees = result[0]?.fees || 0
  const dailyVolume = result[0]?.volume || 0

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume:
    'Outcome token trading volume on DFlow prediction markets (Solana). Calculated from CASH/USDC transfers to the settlement vault.',
  Fees: 'Platform fees collected in CASH and USDC. Fee formula: scale * p * (1 - p) * c.',
  Revenue: 'All fees are protocol revenue',
  ProtocolRevenue: 'All fees go to the protocol',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  start: '2025-11-23',
  chains: [CHAIN.SOLANA],
  isExpensiveAdapter: true,
  doublecounted: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
}

export default adapter
