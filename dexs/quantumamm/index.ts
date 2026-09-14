/*
  QuantumAMM (Solana) — dexs volume adapter

  This reuses the HumidiFi/AlphaQ/BisonFi pattern: 
  - Filter solana.instruction_calls by Quantum's program address (QuaNtZsgYRe5Z9Bk4LZ4cTD9tbkVoyCNf1R2BN9bBDv)
  - Join tokens_solana.transfers at inner_instruction_index + 1 (Quantum's Swap instruction immediately CPIs a token transfer)
 
  `start` is set to Quantum's program deploy date (`deployWithMaxDataLen` tx)
*/

import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const query = `
        with swaps as (
            select
                tx_id
                , outer_instruction_index
                , inner_instruction_index
            from solana.instruction_calls
            where executing_account = 'QuaNtZsgYRe5Z9Bk4LZ4cTD9tbkVoyCNf1R2BN9bBDv'
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
        and t.block_time < from_unixtime(${options.endTimestamp})
    `;
  const data = await queryDuneSql(options, query);

  return {
    dailyVolume: data[0]?.daily_volume ?? 0,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2025-12-11",
  methodology: {
    Volume:
      "Volume derived from token transfers immediately following Quantum's swap instruction CPI, queried via Dune",
  },
};

export default adapter;
