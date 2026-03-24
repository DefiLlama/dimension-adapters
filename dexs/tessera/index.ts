// Program: TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH

import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
        with swaps as (
            select
                tx_id
                , outer_instruction_index
                , inner_instruction_index
            from solana.instruction_calls
            where executing_account = 'TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH'
            and TIME_RANGE
            and tx_success = true
        )
        select
            COALESCE(SUM(amount_usd), 0) as daily_volume
        from tokens_solana.transfers t
            inner join swaps s on t.tx_id = s.tx_id
            and t.outer_instruction_index = s.outer_instruction_index
            and t.inner_instruction_index = s.inner_instruction_index + 1
        where t.block_time >= from_unixtime(${options.startTimestamp})
        and t.block_time < from_unixtime(${options.endTimestamp})
    `
    const data = await queryDuneSql(options, query)

    return {
        dailyVolume: data[0].daily_volume
    }
}

const TESSERA_SWAP_ADDRESS = "0x55555522005BcAE1c2424D474BfD5ed477749E3e"
const SwapEvent = "event TesseraTrade(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address recipient)"

const fetchEvm = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances()

    const logs = await options.getLogs({
        target: TESSERA_SWAP_ADDRESS,
        eventAbi: SwapEvent,
    })

    for (const log of logs) {
        dailyVolume.add(log.tokenIn, log.amountIn)
    }

    return { dailyVolume }
}

const methodology = {
    Volume: "Volume is calculated from swap events on Tessera contracts.",
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetchSolana,
            start: '2025-06-11',
        },
        [CHAIN.BASE]: {
            fetch: fetchEvm,
            start: '2025-10-30',
        },
        [CHAIN.BSC]: {
            fetch: fetchEvm,
            start: '2025-11-13',
        },
    },
    dependencies: [Dependencies.DUNE],
    methodology,
    isExpensiveAdapter: true,
}

export default adapter
