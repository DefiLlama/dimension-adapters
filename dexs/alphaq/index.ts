import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

// https://www.alphaq.xyz/docs
const FEE_RATE = 0.00001; // 0.001%

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const query = `
    with swaps as (
      select
        tx_id
        , outer_instruction_index
        , inner_instruction_index
      from solana.instruction_calls
      where executing_account = 'ALPHAQmeA7bjrVuccPsYPiCvsi428SNwte66Srvs4pHA'
      and TIME_RANGE
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
  const dailyVolume = data[0]?.daily_volume ?? 0
  const dailyFees = Number(dailyVolume) * FEE_RATE

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: '2025-07-10',
  methodology: {
    Fees: 'Flat 0.001% fee per swap on major pairs.',
    Revenue: 'All fees are revenue collected by AlphaQ.',
    ProtocolRevenue: 'All fees are revenue collected by AlphaQ.',
  }
}

export default adapter