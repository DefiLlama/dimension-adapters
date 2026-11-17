import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getEVMTokenTransfers } from "../helpers/token";
import { queryAllium } from "../helpers/allium";

// Solana: Matcha's swap fee (https://help.matcha.xyz/en/articles/3953360-are-there-any-fees-to-make-a-trade, "including Solana")
// is paid to this wallet inside the swap instruction, first on 2026-08-21
// (2kxWG9EedYUwoB5KwNfoRi125hfcog8GSCV5ytdK69HzqZVw4XqTD8xr11L3aTtVVqnZbD3RfRrD5p2YDM4zZrfT, 0.25% in SOL)
const SOLANA_FEE_WALLET = '9N2J4Wz2WN9LXnpu8gyC9q3AC4VAdjJFeJewgEAdgU5H'
// the two routes that pay it: 0x Settler on Solana (e.g. 2SH9GdW5LL1fqtdLuqvNFxotxp1enGvRMrhNKiakcTX6BLx9U795wHNwthiNVwYGJZsVXLV4ZsAHpPKPcR6aPTQ4)
// and Jupiter v6 routes with the fee as platform fee (e.g. BJMPWSNVRR28kJ39Biri6NZSTvec7Kjs3537YafNBhNMBwQfP3kogaAeAS2FpeNu69ohF25wAx8wWEXGf5P3F9L).
// Transfers into the wallet from any other program (airdrops, spam tokens) are not fees.
const SOLANA_SWAP_PROGRAMS = ['Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m', 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4']

const fetchSolanaFees = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    WITH fees AS (
      SELECT mint, SUM(raw_amount) AS amount
      FROM solana.assets.transfers
      WHERE to_address = '${SOLANA_FEE_WALLET}'
        AND from_address != '${SOLANA_FEE_WALLET}'
        AND outer_program_id IN (${SOLANA_SWAP_PROGRAMS.map((id) => `'${id}'`).join(', ')})
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      GROUP BY mint
    ),
    checks AS (
      -- the table already holds blocks past the window, so a window without fees is not ingestion lag
      SELECT EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT checks.indexed, fees.mint, fees.amount
    FROM checks
    LEFT JOIN fees ON TRUE
  `)
  if (!rows.length || !rows[0].indexed)
    throw new Error(`matcha-xyz: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`)

  const dailyFees = options.createBalances()
  rows.forEach((row: any) => {
    // native SOL transfers carry the wrapped SOL mint in this table
    if (row.mint) dailyFees.add(row.mint, row.amount, METRIC.TRADING_FEES)
  })
  return dailyFees
}

const fetch: any = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) {
    const dailyFees = await fetchSolanaFees(options)
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
  }

  const balances = await getEVMTokenTransfers({
    options,
    blacklistTxFromAddresses: ['0x38F5E5b4DA37531a6e85161e337e0238bB27aa90'],
    toAddresses: ['0x38F5E5b4DA37531a6e85161e337e0238bB27aa90'],
  })
  const dailyFees = options.createBalances();
  dailyFees.addBalances(balances, METRIC.TRADING_FEES);

  return {
    dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees
  }
}

const methodology = {
  Fees: 'Matcha takes a 0.05% - 0.25% fee on certain pairs for matcha auto trades. On Solana, the fees paid into Matcha\'s Solana fee wallet inside 0x Settler and Jupiter v6 swaps.',
  Revenue: 'all fees are collected by matcha',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Matcha takes a 0.05% - 0.25% fee on certain pairs for matcha auto trades. On Solana, the fees paid into Matcha\'s Solana fee wallet inside 0x Settler and Jupiter v6 swaps.',
  },
}

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2023-06-07' },
  [CHAIN.BASE]: { start: '2024-03-06' },
  [CHAIN.POLYGON]: { start: '2023-02-23' },
  [CHAIN.ARBITRUM]: { start: '2024-02-12' },
  [CHAIN.BSC]: { start: '2023-09-12' },
  [CHAIN.AVAX]: { start: '2024-11-05' },
  [CHAIN.OPTIMISM]: { start: '2024-04-01' },
  [CHAIN.MONAD]: { start: '2025-11-24' },
  // [CHAIN.LINEA]: { start: '2023-06-01' },
  [CHAIN.PLASMA]: { start: '2025-10-01' },
  // [CHAIN.BERACHAIN]: { start: '2025-02-06' },
  [CHAIN.MANTLE]: { start: '2023-11-01' },
  [CHAIN.SCROLL]: { start: '2024-10-02' },
  [CHAIN.SOLANA]: { start: '2026-08-21' },
  // [CHAIN.ABSTRACT]: { start: '2023-06-01' },
  // [CHAIN.MODE]: { start: '2023-06-01' },
}

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology
}

export default adapter;
