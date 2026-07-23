// Program: QUayE6nexQWYNZAEqfN8FxoNwQDSu3CAzT2qq9J1ArG (Quay Markets)
// Oracle-quoted MM venue on Solana. Takers swap via the `swap` (0x20) or
// `agg_swap` (0x21) entrypoints; keeper quote pushes (0x04) and admin/MM
// instructions carry no taker flow and are excluded by discriminator.

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const QUAY_PROGRAM = 'QUayE6nexQWYNZAEqfN8FxoNwQDSu3CAzT2qq9J1ArG';

const fetch = async (options: FetchOptions) => {
    const query = `
        with swaps as (
            select
                tx_id
                , outer_instruction_index
                , inner_instruction_index
            from solana.instruction_calls
            where executing_account = '${QUAY_PROGRAM}'
                and bytearray_substring(data, 1, 1) in (0x20, 0x21) -- swap / agg_swap
                and TIME_RANGE
                and tx_success = true
        )
        select
            SUM(amount_usd) as daily_volume
        from tokens_solana.transfers t
            inner join swaps s on t.tx_id = s.tx_id
            and t.outer_instruction_index = s.outer_instruction_index
            and t.inner_instruction_index = coalesce(s.inner_instruction_index, -1) + 1
        where t.block_time >= from_unixtime(${options.startTimestamp})
        and t.block_time <= from_unixtime(${options.endTimestamp})
    `;
    const data = await queryDuneSql(options, query);

    return {
        dailyVolume: data[0]?.daily_volume ?? 0
    };
};

const adapter: SimpleAdapter = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: '2026-07-17',
    methodology: {
        Volume: "Sum of the input-leg token transfer (USD) of every successful Quay swap/agg_swap instruction, counted once per swap.",
    },
};

export default adapter;
