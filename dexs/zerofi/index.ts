// Program: ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY

import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
    const query = `
        with swaps as (
            select
                tx_id
                , outer_instruction_index
                , inner_instruction_index
            from solana.instruction_calls
            where executing_account = 'ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY'
            and TIME_RANGE
            and lower(to_hex(data)) like '06%'
            and tx_success = true
        )
        select
            SUM(amount_usd) as daily_volume
        from tokens_solana.transfers t
            inner join swaps s on t.tx_id = s.tx_id
            and t.outer_instruction_index = s.outer_instruction_index
            and t.inner_instruction_index = s.inner_instruction_index + 1
        where t.block_time >= from_unixtime(${options.startTimestamp})
        and t.block_time <= from_unixtime(${options.endTimestamp})
    `
    const data = await queryDuneSql(options, query)

    return {
        dailyVolume: data[0]?.daily_volume ?? 0
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2024-12-12',
}

export default adapter
