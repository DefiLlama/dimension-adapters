import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// source: https://dune.com/queries/7638215
const query = `
  WITH ix AS (
    SELECT block_date AS day, tx_signer,
          lower(to_hex(bytearray_substring(data, 1, 8))) AS disc
    FROM solana.instruction_calls
    WHERE executing_account = 'zincUFpnqYwdYMc1KfH6rKcBvbcdVtHKckKhvrHLDsV'
      AND TIME_RANGE
  ),
  daily AS (
    SELECT count(DISTINCT CASE WHEN disc IN (
        '1e01a07f27c78600','f2f8591ebd9f3b9d','7b8b18a832cd9d51','82e261036f820ede','b04f15d90990de0c',
        'ceb0ca12c8d1b36c','5a5f6b2acd7c32e1','69165acc9d9111e7','3ed9522b034f39f2','f37a0dc84f8fb991',
        'f56ab02904a7e15c','fcdfc8d1fc05f341','4111767b3cf731a5','b5f8d719a050304f','0c4f9d925cc55f12','577963b87e3f67d9'
      ) THEN tx_signer END) AS active_players,
      count_if(disc IN ('1e01a07f27c78600','477a16bf7134f551')) AS rounds_deployed
    FROM ix
  )
  SELECT active_players, rounds_deployed
  FROM daily`

const fetch = async (options: FetchOptions) => {
  const result = await queryDuneSql(options, query);
  const { active_players, rounds_deployed } = result[0]

  return {
    dailyActiveUsers: active_players,
    dailyTransactionsCount: rounds_deployed,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: "2026-05-25",
};

export default adapter;
