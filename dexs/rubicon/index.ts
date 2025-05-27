import { Adapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

const prefetch = async (options: FetchOptions) => {

  const results = await queryDuneSql(
    options,
    `
    SELECT l.blockchain, l.tx_hash, t.tx_hash, varbinary_substring(l.topic2, 13) AS filler,
      varbinary_substring(l.topic3, 13) AS swapper, t.contract_address, t.amount_usd
    FROM evms.logs l, tokens.transfers t
    WHERE l.blockchain IN ('optimism', 'base', 'arbitrum', 'ethereum')
    AND l.contract_address IN (0x6d81571b4c75ccf08bd16032d0ae54dbaff548b0,
    0x3c53c04d633bec3fb0de3492607c239bf92d07f9,
    0xbd7f9d0239f81c94b728d827a87b9864972661ec,
    0xcb23e6c82c900e68d6f761bd5a193a5151a1d6d2,
    0x98169248bdf25e0e297ea478ab46ac24058fac78,
    0x95b7F3662Ba73b3fF35874Af0E09b050dB03118B
    )
    AND l.topic0 = 0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66
    AND t.blockchain = l.blockchain AND t.tx_hash = l.tx_hash
    AND t."from" = varbinary_substring(l.topic2, 13) AND t."to" = varbinary_substring(l.topic3, 13)
    AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
    AND block_time < FROM_UNIXTIME(${options.endTimestamp})
    `
  )
  return results
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const results = options.preFetchedResults
  
  if (results && results.length > 0) {
    results.forEach(row => {
      if (row.blockchain === options.chain){
        dailyVolume.addUSDValue(row.amount_usd)
      }
    });
  }

  return { dailyVolume }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch as any,
      start: "2023-09-24"
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: "2024-02-21"
    },
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: "2024-03-19"
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: "2023-04-24"
    }
  },
  prefetch: prefetch,
  isExpensiveAdapter: true  
}

export default adapter;
