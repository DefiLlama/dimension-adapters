import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { timeFilter, u64, u8 } from "../helpers/alliumSolanaEvents";
import { addOneToken } from "../helpers/prices";

const DLMM_PROGRAM = '1qbkdrr3z4ryLA7pZykqxvxWPoeifcVKo6ZG9CfkvVE' // https://solscan.io/account/1qbkdrr3z4ryLA7pZykqxvxWPoeifcVKo6ZG9CfkvVE
// accounts: pair @0, token X mint @1, token Y mint @2
const SWAP_INSTRUCTION = 'f8c69e91e17587c8'
// emit_cpi tag + BinSwapEvent discriminator, one event per bin a swap crosses
// swap_for_y @48, u64: protocol_fee @49, amount_in @61, amount_out @69, fee @81 (fees in the input token)
const BIN_SWAP_EVENT = 'e445a52e51cb9a1d372ac0c2e6f30948'
const WASH_TRADED_MINT = '7hc6hXjDPcFnhGBPBGTKUtViFsQuyWw8ph4ePHF1aTYG'

const swapMint = (accountIndex: number) => `LAST_VALUE(IFF(LEFT(data_hex, 16) = '${SWAP_INSTRUCTION}', accounts[${accountIndex}]::STRING, NULL)) IGNORE NULLS
  OVER (PARTITION BY txn_id, instruction_index ORDER BY inner_instruction_index ROWS UNBOUNDED PRECEDING)`

async function fetch(options: FetchOptions) {
  const rows = await queryAllium(`
    WITH calls AS (
      SELECT txn_id, instruction_index, -1 AS inner_instruction_index, data_hex, accounts, TRUE AS tx_success
      FROM solana.raw.instructions
      WHERE program_id = '${DLMM_PROGRAM}' AND data_hex_first16 = '${SWAP_INSTRUCTION}' AND ${timeFilter(options)}
      UNION ALL
      SELECT txn_id, instruction_index, inner_instruction_index, data_hex, accounts, parent_tx_success
      FROM solana.raw.inner_instructions
      WHERE program_id = '${DLMM_PROGRAM}' AND ${timeFilter(options)}
        AND (data_hex_first16 = '${SWAP_INSTRUCTION}' OR LEFT(data_hex, 32) = '${BIN_SWAP_EVENT}')
    ),
    events AS (
      SELECT data_hex, tx_success, ${swapMint(1)} AS mint_x, ${swapMint(2)} AS mint_y
      FROM calls
    ),
    swaps AS (
      SELECT
        IFF(${u8('data_hex', 48)} = '01', mint_x, mint_y) AS token_in,
        IFF(${u8('data_hex', 48)} = '01', mint_y, mint_x) AS token_out,
        SUM(${u64('data_hex', 61)}) AS amount_in,
        SUM(${u64('data_hex', 69)}) AS amount_out,
        SUM(${u64('data_hex', 81)}) AS fee,
        SUM(${u64('data_hex', 49)}) AS protocol_fee
      FROM events
      WHERE LEFT(data_hex, 32) = '${BIN_SWAP_EVENT}' AND tx_success
        AND '${WASH_TRADED_MINT}' NOT IN (mint_x, mint_y)
      GROUP BY 1, 2
    ),
    checks AS (
      SELECT EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT k.indexed, s.* FROM checks k LEFT JOIN swaps s ON TRUE
  `)
  if (!rows[0]?.indexed) throw new Error(`saros-dlmm: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`)

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const { token_in, token_out, amount_in, amount_out, fee, protocol_fee } of rows) {
    if (!token_in) continue
    const addShare = (balances: any, share: number, label?: string) =>
      addOneToken({ chain: CHAIN.SOLANA, balances, token0: token_in, amount0: share, token1: token_out, amount1: amount_out * share / amount_in, label })

    addShare(dailyVolume, amount_in)
    addShare(dailyFees, fee, 'Swap Fees')
    addShare(dailyRevenue, protocol_fee, 'Swap Fees To Protocol')
    addShare(dailySupplySideRevenue, fee - protocol_fee, 'Swap Fees To LPs')
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  // v1: one full-day Allium query per day. Hourly slices ran minutes after each hour closed, before Allium had
  // indexed past it, so every hourly run would throw the lag check
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-05-29',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: 'Swap volume on Saros DLMM pools on Solana, including swaps routed through aggregators. One wash-traded token is excluded.',
    Fees: 'Swap fees paid by traders on Saros DLMM pools.',
    UserFees: 'Swap fees paid by traders on Saros DLMM pools.',
    Revenue: 'Share of swap fees on Saros DLMM pools kept by the protocol.',
    ProtocolRevenue: 'Share of swap fees on Saros DLMM pools kept by the protocol.',
    SupplySideRevenue: 'Share of swap fees on Saros DLMM pools paid to liquidity providers.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by traders on Saros DLMM pools.',
    },
    UserFees: {
      'Swap Fees': 'Swap fees paid by traders on Saros DLMM pools.',
    },
    Revenue: {
      'Swap Fees To Protocol': 'Share of swap fees on Saros DLMM pools kept by the protocol.',
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': 'Share of swap fees on Saros DLMM pools kept by the protocol.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Share of swap fees on Saros DLMM pools paid to liquidity providers.',
    },
  },
};
export default adapter;
