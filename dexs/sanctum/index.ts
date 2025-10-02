import { ChainBlocks, Dependencies, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances()
  const solDispensed = (
    // https://dune.com/queries/3276095
    await queryDuneSql(options, `
      SELECT
        SUM(pre_balances[i] - post_balances[i]) / 1e9 AS sol_dispensed,
        COUNT(*) AS n_unstakes
      FROM (
        SELECT
          account_keys,
          pre_balances,
          post_balances,
          ARRAY_POSITION(account_keys, '3rBnnH9TTgd3xwu48rnzGsaQkSr1hR64nY71DrDt6VrQ') AS i
        FROM solana.transactions
        WHERE
          CONTAINS(account_keys, '5Pcu8WeQa3VbBz2vdBT49Rj4gbS4hsnfzuL1LmuRaKFY') /* = fee account, since that's in all unstake and set_fee ix invokes but nothing else */
          AND CONTAINS(account_keys, '3rBnnH9TTgd3xwu48rnzGsaQkSr1hR64nY71DrDt6VrQ')
          AND success = TRUE
          AND block_time > from_unixtime(${timestamp}) - INTERVAL '1' day
          AND block_time < from_unixtime(${timestamp})
      )
    `)
  )[0].sol_dispensed;
  dailyVolume.addCGToken("solana", solDispensed);

  return { dailyVolume, timestamp, };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2022-07-14',
  isExpensiveAdapter: true,
};

export default adapter;
