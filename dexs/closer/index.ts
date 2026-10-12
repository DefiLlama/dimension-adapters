import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'
import { METRIC } from '../../helpers/metrics'

// Closer prediction-market vault program (Anchor), USDC-only
const CLOSER_PROGRAM = 'CLoseukDtTCoUe5ECMjiLABYTCtC94qJz9LpN8tSHPM4'

// Anchor discriminators: sha256("global:settle_fill")[..8] and sha256("event:FillEvent")[..8]
const SETTLE_FILL_DISC = '0xc5518732bf03ab4b'
const FILL_EVENT_DISC = '0x0d5929e469b22d70'

// settle_fill ix data (1-indexed): disc 1-8 | fill_id 9-16 | strike 17 | size 18-25 | price 26-33 | gross_amount 34-41 | side 42 | stake 43-50
// FillEvent (1-indexed): disc 1-8 | wallet 9-40 | market 41-48 | strike 49 | size 50-57 | price 58-65 | gross 66-73 | fee 74-81 | side 82 | ts 83-90 | version 91-92
// fee is ceil(gross * fee_bps / 10_000) on BUY and 0 on SELL, computed on-chain; fee_bps is set per market at creation.
const sql = `
  WITH fills AS (
    SELECT tx_id, data, log_messages
    FROM solana.instruction_calls
    WHERE executing_account = '${CLOSER_PROGRAM}'
      AND tx_success
      AND bytearray_substring(data, 1, 8) = ${SETTLE_FILL_DISC}
      AND TIME_RANGE
  ),
  volume AS (
    SELECT COALESCE(SUM(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 34, 8)))), 0) AS volume
    FROM fills
  ),
  fill_events AS (
    SELECT TRY(from_base64(split_part(substr(msg, 15), ' ', 1))) AS ev
    FROM (SELECT DISTINCT tx_id, log_messages FROM fills) f
    CROSS JOIN UNNEST(f.log_messages) AS l(msg)
    WHERE msg LIKE 'Program data: DVkp5Gmy%'  -- base64 prefix of FillEvent disc
  ),
  fees AS (
    SELECT COALESCE(SUM(bytearray_to_bigint(bytearray_reverse(bytearray_substring(ev, 74, 8)))), 0) AS fees
    FROM fill_events
    WHERE bytearray_substring(ev, 1, 8) = ${FILL_EVENT_DISC}
  )
  SELECT volume, fees FROM volume CROSS JOIN fees
`

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const [row] = await queryDuneSql(options, sql)
  dailyVolume.add(ADDRESSES.solana.USDC, row?.volume ?? 0)
  dailyFees.add(ADDRESSES.solana.USDC, row?.fees ?? 0, METRIC.TRADING_FEES)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-10-09',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Volume: 'Sum of gross_amount (USDC) across every successful settle_fill instruction, BUYs and SELLs. Counts the trader side only; the house counterparty leg is not counted.',
    Fees: 'Trading fee charged on BUY fills, read from the fee field of the on-chain FillEvent. SELLs and settlements carry no fee.',
    UserFees: 'Same as Fees: the BUY trading fee is paid by traders.',
    Revenue: 'All trading fees are retained by the protocol treasury; there are no LPs or token holders to share with.',
    ProtocolRevenue: 'All trading fees are retained by the protocol treasury.',
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRADING_FEES]: 'Fee charged on BUY fills (ceil(gross * fee_bps / 10000), currently 1.5%).' },
    UserFees: { [METRIC.TRADING_FEES]: 'Fee charged on BUY fills, paid by traders.' },
    Revenue: { [METRIC.TRADING_FEES]: 'Fee charged on BUY fills, 100% to the protocol treasury.' },
    ProtocolRevenue: { [METRIC.TRADING_FEES]: 'Fee charged on BUY fills, 100% to the protocol treasury.' },
  },
}

export default adapter
