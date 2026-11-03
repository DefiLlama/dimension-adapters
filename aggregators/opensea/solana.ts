import { FetchOptions } from "../../adapters/types";

// SPL Memo signers identify the trader even when a sponsor pays the transaction fee.
// https://www.solana-program.com/docs/memo
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
// OpenSea swap fee recipient: https://solscan.io/account/FEwxLZ64Wdh1VFP53jfA37yDVnD8gL3FgzsZNuQ6pCC9
const FEE_WALLET = 'FEwxLZ64Wdh1VFP53jfA37yDVnD8gL3FgzsZNuQ6pCC9';
// First four bytes of keccak256('swap.opensea.io'), encoded as ASCII hex in the memo.
const DOMAIN_HASH = '865d8597';

export const solanaVolumeQuery = (options: FetchOptions) => {
	const timeRange = (column: string) => `${column} >= FROM_UNIXTIME(${options.startTimestamp}) AND ${column} < FROM_UNIXTIME(${options.endTimestamp})`;
	return `
		WITH opensea_traders AS (
			SELECT DISTINCT tx_id, element_at(account_arguments, 1) AS trader_id
			FROM solana.instruction_calls
			WHERE ${timeRange('block_time')}
				AND tx_success
				AND executing_account = '${MEMO_PROGRAM}'
				AND cardinality(account_arguments) = 1
				AND regexp_like(from_utf8(data), '^([0-9a-f]{8})?${DOMAIN_HASH}$')
			UNION
			-- The fee payer is a fallback when the optional attribution memo was omitted.
			-- Fee amounts identify the trader only; no fee-rate assumption values the swap.
			SELECT DISTINCT tx_id, from_owner AS trader_id
			FROM tokens_solana.transfers
			WHERE ${timeRange('block_time')}
				AND to_owner = '${FEE_WALLET}'
				AND from_owner IS NOT NULL
				AND from_owner <> '${FEE_WALLET}'
				AND action = 'transfer'
				AND amount > 0
		),
		route_legs AS (
			SELECT t.tx_id, t.trader_id, t.outer_instruction_index, t.inner_instruction_index,
				t.token_sold_mint_address, t.token_bought_mint_address,
				t.token_sold_amount_raw, t.token_bought_amount_raw, t.amount_usd,
				FIRST_VALUE(t.token_sold_mint_address) OVER (
					PARTITION BY t.tx_id, t.trader_id, t.outer_instruction_index
					ORDER BY t.inner_instruction_index NULLS FIRST
				) AS entry_mint
			FROM dex_solana.trades t
			INNER JOIN opensea_traders os ON t.tx_id = os.tx_id AND t.trader_id = os.trader_id
			WHERE ${timeRange('t.block_time')}
		),
		input_balances AS (
			SELECT *,
				SUM(
					CASE WHEN token_sold_mint_address = entry_mint THEN CAST(token_sold_amount_raw AS DECIMAL(38, 0)) ELSE 0 END
					- CASE WHEN token_bought_mint_address = entry_mint THEN CAST(token_bought_amount_raw AS DECIMAL(38, 0)) ELSE 0 END
				) OVER (
					PARTITION BY tx_id, trader_id, outer_instruction_index
					ORDER BY inner_instruction_index NULLS FIRST ROWS UNBOUNDED PRECEDING
				) AS input_deficit
			FROM route_legs
		),
		new_inputs AS (
			SELECT *,
				CASE WHEN token_sold_mint_address = entry_mint THEN
					GREATEST(input_deficit - GREATEST(COALESCE(MAX(input_deficit) OVER (
						PARTITION BY tx_id, trader_id, outer_instruction_index
						ORDER BY inner_instruction_index NULLS FIRST ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
					), 0), 0), 0)
				ELSE 0 END AS new_input_raw
			FROM input_balances
		)
		-- Only increases in the route's input deficit are new user notional: split inputs
		-- add up, intermediate hops and recycled input in cyclic routes do not.
		-- Unpriced input legs are counted in unpriced_input_legs and contribute 0 to volume.
		SELECT
			CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(
				CASE WHEN new_input_raw > 0 AND amount_usd IS NOT NULL THEN
					CAST(new_input_raw AS DOUBLE) / NULLIF(CAST(token_sold_amount_raw AS DOUBLE), 0) * amount_usd
				ELSE 0 END
			) END AS volume,
			COUNT(*) AS decoded_legs,
			COUNT(CASE WHEN new_input_raw > 0 THEN 1 END) AS input_legs,
			COUNT(CASE WHEN new_input_raw > 0 AND amount_usd IS NULL THEN 1 END) AS unpriced_input_legs
		FROM new_inputs
	`;
};
