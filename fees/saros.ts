import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { timeFilter } from "../helpers/alliumSolanaEvents";
import { getMultipleAccounts } from "../helpers/solana";

const SAROS_AMM_PROGRAM = 'SSwapUtytfBdBn1b9NUGG6foMVPtcWgpRU32HToDUZr'
// SPL token-swap pool layout, u64 each: trade fee numerator, denominator, owner trade fee numerator, denominator
// https://github.com/solana-labs/solana-program-library/blob/master/token-swap/program/src/state.rs
const POOL_FEES_OFFSET = 227

async function fetch(options: FetchOptions) {
  const rows = await queryAllium(`
    WITH pools AS (
      SELECT pool, SUM(usd_amount) AS volume
      FROM solana.dex.trades
      WHERE program_id = '${SAROS_AMM_PROGRAM}' AND usd_amount > 0 AND ${timeFilter(options)}
      GROUP BY pool
    ),
    checks AS (
      SELECT EXISTS (SELECT 1 FROM solana.dex.trades
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 3600})) AS indexed
    )
    SELECT k.indexed, p.* FROM checks k LEFT JOIN pools p ON TRUE
  `)
  if (!rows[0]?.indexed) throw new Error(`saros: Allium has not indexed Solana trades after ${options.endTimestamp} yet`)

  const pools = rows.filter((row: any) => row.pool)
  const poolAccounts = await getMultipleAccounts({
    chain: CHAIN.SOLANA,
    accounts: pools.map((row: any) => row.pool),
    dataSlice: { offset: POOL_FEES_OFFSET, length: 32 },
  })

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  pools.forEach((row: any, i: number) => {
    const account = poolAccounts[i]
    if (!account || account.owner !== SAROS_AMM_PROGRAM) throw new Error(`saros: pool account ${row.pool} not found`)
    const data = Buffer.from(account.data[0], 'base64')
    const lpFeeRate = Number(data.readBigUInt64LE(0)) / Number(data.readBigUInt64LE(8))
    const protocolFeeRate = Number(data.readBigUInt64LE(16)) / Number(data.readBigUInt64LE(24))

    dailyFees.addUSDValue(row.volume * (lpFeeRate + protocolFeeRate), 'Swap Fees')
    dailyRevenue.addUSDValue(row.volume * protocolFeeRate, 'Swap Fees To Protocol')
    dailySupplySideRevenue.addUSDValue(row.volume * lpFeeRate, 'Swap Fees To LPs')
  })

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  // v1: one full-day Allium query per day. Hourly slices ran minutes after each hour closed, before Allium had
  // indexed past it (dex.trades loads ~1-2.5h behind), so every hourly run would throw the lag check
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2021-12-16',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Swap fees paid by traders on Saros AMM pools, 0.3% of swap volume on most pools.',
    UserFees: 'Swap fees paid by traders on Saros AMM pools, 0.3% of swap volume on most pools.',
    Revenue: 'Share of swap fees on Saros AMM pools kept by the protocol, set per pool: 0.05% of swap volume on some pools and the full 0.3% on others.',
    ProtocolRevenue: 'Share of swap fees on Saros AMM pools kept by the protocol, set per pool: 0.05% of swap volume on some pools and the full 0.3% on others.',
    SupplySideRevenue: 'Share of swap fees on Saros AMM pools paid to liquidity providers, 0.25% of swap volume on the pools that pay one.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by traders on Saros AMM pools.',
    },
    UserFees: {
      'Swap Fees': 'Swap fees paid by traders on Saros AMM pools.',
    },
    Revenue: {
      'Swap Fees To Protocol': 'Share of swap fees on Saros AMM pools kept by the protocol.',
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': 'Share of swap fees on Saros AMM pools kept by the protocol.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Share of swap fees on Saros AMM pools paid to liquidity providers.',
    },
  },
};
export default adapter;
