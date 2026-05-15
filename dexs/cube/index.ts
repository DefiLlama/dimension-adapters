import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Cube DEX pool program (Solana mainnet). The on-chain Rust module is
// named `cubic_pool` (legacy name from before the protocol rebrand to Cube).
const PROGRAM_ID = "8iQtGj9mcUfFUGaiCpPy89swC3s8YTC8FhVZWfgeZhwu";

// Anchor instruction discriminator for `swap` (first 8 bytes of the
// instruction data). Source: contracts/idl/cubic_pool.json
const SWAP_DISCRIMINATOR_HEX = "f8c69e91e17587c8";

// Anchor event discriminator for `Swap` (first 8 bytes of the Anchor
// `emit!()` payload).  Base64-encoded prefix of these bytes is `UWzj`
// which is what we filter the `Program data: …` log lines on.
const SWAP_EVENT_DISCRIMINATOR_HEX = "516ce3becdd00ac4";
const SWAP_EVENT_BASE64_PREFIX = "UWzj";

// Anchor `Swap` event layout (Borsh, all little-endian):
//   data[1..=8]    = discriminator (filter)
//   data[9..=40]   = pool: pubkey
//   data[41..=72]  = user: pubkey
//   data[73..=104] = token_in: pubkey
//   data[105..=136]= token_out: pubkey
//   data[137..=144]= amount_in: u64
//   data[145..=152]= amount_out: u64
//   data[153..=160]= fee_amount: u64        ← total swap fee (input token native units)
//   data[161..=168]= protocol_fee_amount: u64 ← protocol share of fee_amount
//   data[169..=176]= timestamp: i64
// Total payload: 176 bytes.
//
// `fee_amount` is in the input token's native (smallest) units; we
// add it to a Balances object keyed by the input token mint so the
// DefiLlama price layer converts it to USD.

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();        // protocol-side fees
  const dailySupplySideRevenue = options.createBalances(); // LP-side fees

  // 1) Volume: parse `amount_in` from the swap instruction data and
  //    attribute it to the input token mint from account_arguments.
  const volumeRows = await queryDuneSql(
    options,
    `WITH cube_swaps AS (
      SELECT
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 9, 8))) AS amount_in,
        account_arguments[2] AS token_mint_in
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND bytearray_substring(data, 1, 8) = from_hex('${SWAP_DISCRIMINATOR_HEX}')
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND tx_success = true
    )
    SELECT
      token_mint_in,
      SUM(amount_in) AS total_amount
    FROM cube_swaps
    WHERE amount_in > 0
    GROUP BY token_mint_in`
  );

  for (const row of volumeRows) {
    dailyVolume.add(row.token_mint_in, row.total_amount);
  }

  // 2) Fees: decode the Anchor `Swap` event payload from program logs
  //    and pull `fee_amount` + `protocol_fee_amount`. We pre-filter
  //    transactions to ones that touched the Cube program so the
  //    log_messages scan stays bounded.
  const feeRows = await queryDuneSql(
    options,
    `WITH cube_txs AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND bytearray_substring(data, 1, 8) = from_hex('${SWAP_DISCRIMINATOR_HEX}')
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND tx_success = true
    ),
    swap_event_payloads AS (
      SELECT event_data FROM (
        SELECT
          try(from_base64(split(l.log, ' ')[3])) AS event_data
        FROM solana.transactions t
        CROSS JOIN UNNEST(t.log_messages) AS l(log)
        WHERE t.id IN (SELECT tx_id FROM cube_txs)
          AND t.block_time >= from_unixtime(${options.startTimestamp})
          AND t.block_time < from_unixtime(${options.endTimestamp})
          AND l.log LIKE 'Program data: ${SWAP_EVENT_BASE64_PREFIX}%'
          AND cardinality(split(l.log, ' ')) = 3
      )
      WHERE event_data IS NOT NULL
    ),
    parsed AS (
      SELECT
        bytearray_substring(event_data, 73, 32)  AS token_in_bytes,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(event_data, 153, 8))) AS fee_amount,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(event_data, 161, 8))) AS protocol_fee_amount
      FROM swap_event_payloads
      WHERE LENGTH(event_data) >= 176
        AND bytearray_substring(event_data, 1, 8) = from_hex('${SWAP_EVENT_DISCRIMINATOR_HEX}')
    )
    SELECT
      to_base58(token_in_bytes) AS token_mint_in,
      SUM(fee_amount)          AS total_fee,
      SUM(protocol_fee_amount) AS total_protocol_fee
    FROM parsed
    WHERE fee_amount > 0
    GROUP BY token_in_bytes`
  );

  for (const row of feeRows) {
    const fee = Number(row.total_fee || 0);
    const protocolFee = Number(row.total_protocol_fee || 0);
    const lpFee = fee - protocolFee;
    dailyFees.add(row.token_mint_in, fee);
    dailyRevenue.add(row.token_mint_in, protocolFee);
    if (lpFee > 0) dailySupplySideRevenue.add(row.token_mint_in, lpFee);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  fetch,
  start: "2026-05-01",
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Sum of `amount_in` parsed directly from on-chain Cube `swap` instructions on Solana, attributed to the input token mint. Computed via Dune SQL over `solana.instruction_calls` filtered by program id and the swap-instruction discriminator.",
    Fees:
      "Sum of `fee_amount` parsed from the Anchor `Swap` event payload that the Cube program emits via `emit!()` into program logs. The event encodes both the total swap fee and the protocol's share — see the Anchor IDL at https://github.com/cubee-ee for the exact layout. Fees are accumulated per input-token mint and priced via the DefiLlama price layer.",
    UserFees:
      "Same as Fees — all swap fees are paid by users.",
    Revenue:
      "Sum of `protocol_fee_amount` (the protocol's share of `fee_amount`) parsed from the same Anchor `Swap` event payload.",
    ProtocolRevenue:
      "Same as Revenue — the protocol's share accrues to the Cube protocol fees authority PDA on-chain.",
    SupplySideRevenue:
      "`fee_amount - protocol_fee_amount` per swap — the LPs' share of the swap fee.",
  },
};

export default adapter;
