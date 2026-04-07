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
        CASE 
            WHEN TO_HEX(data) LIKE '66063D1201DAEBEA%' THEN 1 ELSE 2 END as inner_instruction_index
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND (
            TO_HEX(data) LIKE '66063D1201DAEBEA%' -- buy discriminator
            OR TO_HEX(data) LIKE '33E685A4017F83AD%' -- sell discriminator
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
      AND t.inner_instruction_index = s.inner_instruction_index
    WHERE TIME_RANGE
      AND t.amount_usd > 0
  `;

    const data = await queryDuneSql(options, query);
    const dailyVolume = data[0].daily_volume;
    const dailyFees = Number(dailyVolume) * FEE_RATE;
    const dailyRevenue = Number(dailyVolume) * TREASURY_RATE;
    const dailyHoldersRevenue = Number(dailyVolume) * (FEE_RATE - TREASURY_RATE);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailyHoldersRevenue,
    };
};

const methodology = {
    Volume: "Total USD value of buy and sell trades on PigeonHouse bonding curves, queried from on-chain transaction data via Dune.",
    Fees: "2% platform fee on every trade, calculated from on-chain volume.",
    Revenue: "0.5% treasury revenue from each trade.",
    ProtocolRevenue: "0.5% protocol revenue from each trade goes to the protocol treasury",
    HoldersRevenue: "1.5% of each trade goes to the PIGEON token burns",
};

const adapter: SimpleAdapter = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: "2026-03-09",
    methodology,
    isExpensiveAdapter: true,
};

export default adapter;
