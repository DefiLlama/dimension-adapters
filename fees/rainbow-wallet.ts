import { Adapter, Dependencies, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const rainbowRouter = '0x00000000009726632680fb29d3f7a9734e3010e2'

const RainBowRouter = {
  [CHAIN.ETHEREUM]: rainbowRouter,
  [CHAIN.OPTIMISM]: rainbowRouter,
  [CHAIN.BSC]: rainbowRouter,
  [CHAIN.UNICHAIN]: '0x2a0332E28913A06Fa924d40A3E2160f763010417',
  [CHAIN.POLYGON]: rainbowRouter,
  [CHAIN.BASE]: rainbowRouter,
  [CHAIN.ARBITRUM]: rainbowRouter,
  [CHAIN.AVAX]: rainbowRouter,
  [CHAIN.INK]: rainbowRouter,
  [CHAIN.BERACHAIN]: rainbowRouter,
  [CHAIN.BLAST]: rainbowRouter,
  [CHAIN.ZORA]: '0xA61550E9ddD2797E16489db09343162BE98d9483',
  [CHAIN.APECHAIN]: rainbowRouter,
  [CHAIN.GRAVITY]: rainbowRouter,
}

// Prefetch function that will run once before any fetch calls
// don't do console.log(options) as there is circular dependency in ChainApi
const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    WITH eoa_router_trades AS (
        SELECT blockchain, tx_hash, SUM(amount_usd) AS amount_usd
        FROM dex.trades
        WHERE (
            (tx_to = 0x00000000009726632680fb29d3f7a9734e3010e2 AND blockchain NOT IN ('unichain', 'zora'))
            OR (tx_to = 0x2a0332E28913A06Fa924d40A3E2160f763010417 AND blockchain = 'unichain')
            OR (tx_to = 0xA61550E9ddD2797E16489db09343162BE98d9483 AND blockchain = 'zora')
        )
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        GROUP BY 1, 2
    ),

    smart_wallet_validated AS (
        SELECT DISTINCT blockchain, tx_hash
        FROM tokens.transfers
        WHERE tx_from    = tx_to
          AND (
              ("to" = 0x00000000009726632680fb29d3f7a9734e3010e2 AND blockchain NOT IN ('unichain', 'zora'))
              OR ("to" = 0x2a0332E28913A06Fa924d40A3E2160f763010417 AND blockchain = 'unichain')
              OR ("to" = 0xA61550E9ddD2797E16489db09343162BE98d9483 AND blockchain = 'zora')
          )
          AND block_date >= DATE '2026-02-25'
          AND block_time >= from_unixtime(${options.startTimestamp})
          AND block_time <= from_unixtime(${options.endTimestamp})
    ),

    smart_wallet_trades AS (
        SELECT t.blockchain, t.tx_hash, SUM(t.amount_usd) AS amount_usd
        FROM dex.trades t
        INNER JOIN smart_wallet_validated s
            ON t.blockchain = s.blockchain
           AND t.tx_hash    = s.tx_hash
        WHERE t.block_date >= DATE '2026-02-25'
          AND t.block_time >= from_unixtime(${options.startTimestamp})
          AND t.block_time <= from_unixtime(${options.endTimestamp})
        GROUP BY 1, 2
    ),

    combined AS (
        SELECT blockchain, tx_hash, amount_usd FROM eoa_router_trades
        UNION ALL
        SELECT blockchain, tx_hash, amount_usd FROM smart_wallet_trades
    )

    SELECT
        CASE
            WHEN blockchain = 'bnb'         THEN 'bsc'
            WHEN blockchain = 'avalanche_c' THEN 'avax'
            ELSE blockchain
        END AS chain,
        SUM(amount_usd)          AS volume,
        SUM(amount_usd * 0.0085) AS fees
    FROM combined
    GROUP BY 1
  `);
};

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const results = options.preFetchedResults || [];

  let dailyFees = 0;
  for (const result of results) {
    if (result.chain === options.chain) {
      dailyFees = result.fees;
      break;
    }
  }

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Take 0.85% from trading volume",
  Revenue: "Take 0.85% from trading volume",
}

const adapter: Adapter = {
  fetch,
  chains: Object.keys(RainBowRouter),
  start: '2023-01-01',
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
}

export default adapter;