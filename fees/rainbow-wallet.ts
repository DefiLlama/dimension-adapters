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
    SELECT 
        CASE 
            WHEN blockchain = 'bnb' THEN 'bsc'
            WHEN blockchain = 'avalanche_c' THEN 'avax'
            ELSE blockchain
        END as chain,
        sum(amount_usd) as volume,
        sum(amount_usd * 0.0085) as fees
    FROM dex.trades
    WHERE (
        (tx_to = 0x00000000009726632680fb29d3f7a9734e3010e2 AND blockchain NOT IN ('unichain', 'zora'))
        OR
        (tx_to = 0x2a0332E28913A06Fa924d40A3E2160f763010417 AND blockchain = 'unichain')
        OR
        (tx_to = 0xA61550E9ddD2797E16489db09343162BE98d9483 AND blockchain = 'zora')
    )
    AND block_time >= from_unixtime(${options.startTimestamp})
    AND block_time <= from_unixtime(${options.endTimestamp})
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
