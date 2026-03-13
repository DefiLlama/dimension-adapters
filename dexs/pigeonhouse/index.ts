/**
 * DefiLlama Volume/Fees Adapter for PigeonHouse
 *
 * Queries on-chain trade data via Dune Analytics using solana.instruction_calls
 * and tokens_solana.transfers tables to calculate daily volume, fees, and revenue.
 *
 * Program ID: BV1RxkAaD5DjXMsnofkVikFUUYdrDg1v8YgsQ3iyDNoL
 * Fee structure: 2% total (1.5% burn + 0.5% treasury) on PIGEON-paired trades
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const PROGRAM_ID = "BV1RxkAaD5DjXMsnofkVikFUUYdrDg1v8YgsQ3iyDNoL";
const FEE_RATE = 0.02; // 2% platform fee
const TREASURY_RATE = 0.005; // 0.5% treasury revenue

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    WITH trades AS (
      SELECT
        tx_id,
        outer_instruction_index,
        inner_instruction_index
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND (
            TO_HEX(data) LIKE '66063d1201daebea%'  -- buy discriminator
            OR TO_HEX(data) LIKE '33e685a4d2114a73%'  -- sell discriminator
        )
        AND TIME_RANGE
        AND tx_success = true
    )
    SELECT
      COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM tokens_solana.transfers t
    INNER JOIN trades s
      ON t.tx_id = s.tx_id
      AND t.outer_instruction_index = s.outer_instruction_index
    WHERE t.block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND t.block_time <= FROM_UNIXTIME(${options.endTimestamp})
      AND t.amount_usd > 0
  `;

  const data = await queryDuneSql(options, query);
  const dailyVolume = data[0]?.daily_volume ?? 0;
  const dailyFees = Number(dailyVolume) * FEE_RATE;
  const dailyRevenue = Number(dailyVolume) * TREASURY_RATE;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2026-03-09",
  methodology: {
    Volume:
      "Total USD value of buy and sell trades on PigeonHouse bonding curves, queried from on-chain transaction data via Dune.",
    Fees:
      "2% platform fee on every trade, calculated from on-chain volume.",
    Revenue:
      "0.5% treasury revenue from each trade. The remaining 1.5% fee is used for PIGEON token burns (not counted as protocol revenue).",
  },
  isExpensiveAdapter: true,
};

export default adapter;
