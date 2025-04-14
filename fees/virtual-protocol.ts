import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";


type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startOfDay;
  const key = `${url}-${start}`;
  if (!requests[key]){
    const end = start + (24 * 60 * 60);
    // https://dune.com/queries/4514149
    requests[key] = queryDuneSql(options, `
      with base_contracts as (
          -- old token launcher 
          select 
              varbinary_ltrim(varbinary_substring(data, 33, 32)) as token_address
          from base.logs
          where contract_address = 0x94Bf9622348Cf5598D9A491Fa809194Cf85A0D61
          -- newPersona Event
          and topic0 = 0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
          
          union all 
          
          -- 2nd old token launcher 
          select 
              varbinary_ltrim(varbinary_substring(data, 33, 32)) as token_address
          from base.logs
          where contract_address = 0x5706d5A36c2Cc90a6d46E851efCb3C6Ac0372EB2
          -- newPersona Event
          and topic0 = 0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
          
          union all 

          -- bonding contract
          select 
              varbinary_ltrim(varbinary_substring(data, 33, 32)) as token_address
          from base.logs
          where contract_address = 0x71B8EFC8BCaD65a5D9386D07f2Dff57ab4EAf533
          -- newPersona Event
          and topic0 = 0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})

          union all
          
          -- new token launcher pumpfun
          select 
              varbinary_ltrim(topic1) as token_address
          from base.logs
          where contract_address = 0xF66DeA7b3e897cD44A5a231c61B6B4423d613259
          -- Launch Event
          and topic0 = 0x714aa39317ad9a7a7a99db52b44490da5d068a0b2710fffb1a1282ad3cadae1f
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
          
          union all 
          
          -- LUNA address
          select *
          from (
              values 
                  (0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4)
          ) as t (token_address)
      ),
      base_trades_vir_pair AS (
          SELECT
              *,
              date_trunc('day', block_time) as date_time,
              CASE 
                  WHEN token_bought_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b 
                  THEN token_bought_amount  -- when VIRTUAL is bought
                  ELSE token_sold_amount    -- when VIRTUAL is sold
              END as virtual_volume,
            CASE 
                  WHEN token_bought_address in (SELECT token_address FROM base_contracts) THEN token_bought_symbol  
              ELSE token_sold_symbol END AS agent_name
          FROM dex.trades
          WHERE true
          AND (
              (token_bought_address in (SELECT token_address FROM base_contracts) and token_sold_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b)
              OR 
              (token_sold_address in (SELECT token_address FROM base_contracts) and token_bought_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b)
          )
          AND block_time > timestamp '2024-10-16'
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
      ),
      base_trades_others_pair as (
          SELECT
              date_trunc('day', block_time) as date_time,
              amount_usd,
              CASE 
                  WHEN token_bought_address in (SELECT token_address FROM base_contracts) THEN token_bought_symbol  
              ELSE token_sold_symbol END AS agent_name
          FROM dex.trades
          WHERE true
          AND (
              (token_bought_address in (SELECT token_address FROM base_contracts) and token_sold_address != 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b)
              OR 
              (token_sold_address in (SELECT token_address FROM base_contracts) and token_bought_address != 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b)
          )
          AND block_time > timestamp '2024-10-16'
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
      ),
      virtual_prices AS (
          SELECT
              date_time,
              SUM(amount_usd) / SUM(token_bought_amount) AS price
          FROM (
              SELECT
                  DATE_TRUNC('day', block_time) AS date_time,
                  amount_usd,
                  token_bought_amount,
                  amount_usd / token_bought_amount AS price
              FROM dex.trades
              WHERE
                  token_bought_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
                  AND blockchain = 'base'
                  AND block_time > timestamp '2024-10-16'
                  AND amount_usd > 0
                  and block_time >= from_unixtime(${start})
                  and block_time < from_unixtime(${end})
          )
          GROUP BY 1
      ),
      base_metrics AS (
          SELECT 
              t.date_time,
              t.agent_name,
              t.daily_virtual_volume * p.price as daily_volume_usd
          FROM (
              SELECT 
                  date_time,
                  agent_name,
                  SUM(virtual_volume) as daily_virtual_volume            
              FROM base_trades_vir_pair
              GROUP BY 1, 2
          ) t
          LEFT JOIN virtual_prices p ON t.date_time = p.date_time

          union all 

          select 
              date_time,
              agent_name,
              amount_usd as daily_volume_usd
          from base_trades_others_pair
      ),
      -- dex_solana.trades and jupiter aggregate swap tables do not have some of the trade txns. 
      -- idea here is to extract the sold values from carefully extracting only the relevant transactions in solana.account_activity that interacted with the raydium vault authority.
      sol_agent_swaps as (
          select tx_id, token_balance_owner as address, abs(token_balance_change) as token_swap_amt,
            CASE 
                  WHEN token_mint_address = '9se6kma7LeGcQWyRBNcYzyxZPE3r9t9qWZ8SnjnN3jJ7' THEN 'LUNA'
                  WHEN token_mint_address = 'JCKqVrB4cKRFGKFYTMuYzry8QVCgaxS6g5s3HbczCP5W' THEN 'SAM'
                  WHEN token_mint_address = '5SzHH6NKpByimEpb8SrgkZhe6MgKmmuUgLTRJHMp6C48' THEN 'AIRENE'
                  WHEN token_mint_address = '14zP2ToQ79XWvc7FQpm4bRnp9d6Mp1rFfsUW3gpLcRX' THEN 'AIXBT'
              ELSE NULL END as agent_name
          from solana.account_activity
          where true
          and block_time > timestamp '2024-10-15'
          and token_balance_owner = 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL'
          -- and token_balance_owner is not null
          and token_mint_address in (
                  '9se6kma7LeGcQWyRBNcYzyxZPE3r9t9qWZ8SnjnN3jJ7', 
                  'JCKqVrB4cKRFGKFYTMuYzry8QVCgaxS6g5s3HbczCP5W', 
                  '5SzHH6NKpByimEpb8SrgkZhe6MgKmmuUgLTRJHMp6C48', 
                  '14zP2ToQ79XWvc7FQpm4bRnp9d6Mp1rFfsUW3gpLcRX'
              )
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
      ),
      sol_swaps as (
          select a.tx_id, a.block_time, b.agent_name, abs(a.token_balance_change) as sol_swap_amt
          from solana.account_activity a
          inner join sol_agent_swaps b on a.tx_id = b.tx_id
          where true
          and block_time > timestamp '2024-10-15'
          and token_balance_owner = 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL'
          and token_mint_address = 'So11111111111111111111111111111111111111112'
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
      ), 
      hour_sol_price as (
          select date_trunc('hour', "minute") as hour_time, avg(price) as price
          from prices.usd 
          where symbol = 'SOL' and blockchain = 'solana'
          and "minute" > timestamp '2024-10-15'
          and "minute"  >= from_unixtime(${start})
          and "minute" < from_unixtime(${end})
          group by 1
      ),    
      sol_metrics as (
          select date_trunc('day', a.block_time) as date_time, agent_name, sum(sol_swap_amt * b.price) as "$ Volume"
          from sol_swaps a
          left join hour_sol_price b 
          on date_trunc('hour', a.block_time) = b.hour_time 
          and block_time >= from_unixtime(${start})
          and block_time < from_unixtime(${end})
          group by 1, 2
      ),
      combined as (
          select date_time, 'base' as category, agent_name, daily_volume_usd as "$ Volume"
          from base_metrics 

          union all 

          select date_time, 'solana' as category, agent_name, sum("$ Volume") as "$ Volume"
          from sol_metrics 
          group by 1, 2, 3
      ),
      top15_vol as (
          select *
          from (
              select 
                  agent_name,
                  row_number() over (order by sum_volume desc) as rn
              from (
                  select agent_name, sum("$ Volume") as sum_volume
                  from combined 
                  group by 1
              )
          )
          where rn <= 15
      ),
      combined_final as (
          select
              case 
                  when agent_name in (select agent_name from top15_vol) then agent_name
              else 'Others' end as agent_name_final,
              date_time, category, "$ Volume"
          from combined 
      )
      SELECT 
          date_time, 
          category as chain,
          SUM("$ Volume") as volume_usd,
          SUM("$ Volume") * 0.01 as fees_usd
      FROM combined_final
      group by 1, 2
    `);
  }
  return requests[key]
}

const fetchFees = async (_t: any, _b: any ,options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const res = await fetchURLWithRetry("4514149", options);
  const fees = res.find((e: any) => e.chain === options.chain);
  dailyFees.addUSDValue(fees.fees_usd);
  return {
    timestamp: options.startOfDay,
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: "2024-10-16",
    },
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: "2024-10-16",
    },
  },
  isExpensiveAdapter: true,
}

export default adapter;
