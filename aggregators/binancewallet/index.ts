import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { getAllDexTokensBlacklisted } from "../../helpers/lists";

const chainsMap: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.BSC]: 'bnb',
  [CHAIN.AVAX]: 'avalanche_c',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.BASE]: 'base',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SONIC]: 'sonic',
  [CHAIN.ERA]: 'zksync',
  [CHAIN.SOLANA]: 'solana',
  [CHAIN.PLASMA]: 'plasma'
};

const prefetch = async (options: FetchOptions) => {
  const blacklisted = getAllDexTokensBlacklisted();

  const sql_query = `
  with sol as (
        select
            tx_id
            , blockchain
            , block_time
            , trader_id tx_from
            , sum(amount_usd) amount_usd
            from dex_solana.trades
            where 1 = 1
            and TIME_RANGE
            and block_month >= date '2025-01-01'
            group by 1 , 2 , 3 , 4
    )
        , binance_wallet_tx as (
        select
            id as tx_id
            , block_date
            from solana.transactions
            , unnest (post_token_balances) as t (account, mint, owner, amount)
            , unnest (pre_token_balances) as t2 (account, mint, owner, amount)
            where (
                    t.owner in ('B3111yJCeHBcA1bizdJjUFPALfhAfSRnAbJzGUtnt56A')
                or t2.owner in ('B3111yJCeHBcA1bizdJjUFPALfhAfSRnAbJzGUtnt56A')
                or contains(account_keys, 'B3111yJCeHBcA1bizdJjUFPALfhAfSRnAbJzGUtnt56A')
                )
            and TIME_RANGE
            and success = true
            group by 1, 2
    )
        , evm as (
        select
            tx_hash
            , blockchain
            , tx_from
            , tx_to
            , block_date
            , evt_index
            , amount_usd
            from dex.trades
            where tx_to in (
                0xb300000b72DEAEb607a12d5f54773D1C19c7028d, -- all others  
                0x45a0B6ac062a6F137dDC12C01E580cfed1A6F4EC,  -- zksync  
                0xe8B592a331a192d5988EFFff40586CF032e26277,  -- linena  
                0x610776e63C5ca21B92217F4c06398E5437dB6A1E --sonic and plasma
                )
            and not amount_usd is null
            and TIME_RANGE
            and token_sold_address NOT IN (${blacklisted.toString()}) 
            and token_bought_address NOT IN (${blacklisted.toString()}) 
    )
        , total as (
        select
            blockchain
            , sum(a.amount_usd) as trading_volume
            from sol a
                inner join binance_wallet_tx b on a.tx_id = b.tx_id
            where a.amount_usd < 10000000
            group by 1
            union all
        select
            blockchain
            , SUM(amount_usd) as trading_volume
            from evm
            where amount_usd < 10000000
            group by 1
    )
    select
        blockchain
        , sum(trading_volume) as volume_24h
    from total
    group by 1
  `;
  const result = await queryDuneSql(options, sql_query);

  return result;
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.blockchain === chainsMap[options.chain]);

  return {
    dailyVolume: chainData ? chainData.volume_24h : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: Object.keys(chainsMap),
  start: "2025-01-01",
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;