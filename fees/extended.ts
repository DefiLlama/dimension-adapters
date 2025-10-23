import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";

interface IData {
  day: string;
  daily_protocol_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const dailyFees = options.createBalances()

	const data: Array<IData> = await queryDuneSql(options, `
		WITH
      -- ===== Protocol fees from events =====
      trades_a AS (
          SELECT
              varbinary_to_uint256(data[15]) * DECIMAL '0.000001'  AS actual_fee,
              transaction_hash,
              block_time
          FROM starknet.events
          WHERE from_address = 0x062da0780fae50d68cecaa5a051606dc21217ba290969b302db4dd99d2e9b470
            AND keys[1]      = 0x02e0a012a863e6b614014d113e7285b06e30d2999e42e6e03ba2ef6158b0a8f1
            AND block_time  >= TIMESTAMP '2025-07-01'
      ),
      trades_b AS (
          SELECT
              varbinary_to_uint256(data[16]) * DECIMAL '0.000001'  AS actual_fee,
              transaction_hash,
              block_time
          FROM starknet.events
          WHERE from_address = 0x062da0780fae50d68cecaa5a051606dc21217ba290969b302db4dd99d2e9b470
            AND keys[1]      = 0x02e0a012a863e6b614014d113e7285b06e30d2999e42e6e03ba2ef6158b0a8f1
            AND block_time  >= TIMESTAMP '2025-07-01'
      ),
      -- Union of trade events only (for per-trade metrics)
      trades AS (
          SELECT * FROM trades_a
          UNION ALL
          SELECT * FROM trades_b
      ),
      -- Daily average fee per trade (trade events only)
      trades_daily AS (
          SELECT
              date_trunc('day', block_time)          AS day,
              COUNT(*)/2                               AS daily_trade_count, --divide by 2 since the trades tabletrades are for the two sides 
              AVG(actual_fee)                        AS daily_avg_fee_per_trade
          FROM trades
          GROUP BY 1
      ),

      liquidations AS (
          SELECT
              varbinary_to_uint256(data[9]) * DECIMAL '0.000001'  AS actual_fee,
              transaction_hash,
              block_time
          FROM starknet.events
          WHERE from_address = 0x062da0780fae50d68cecaa5a051606dc21217ba290969b302db4dd99d2e9b470
            AND keys[1]      = 0x0320efd552d992294b62e23bcfa29f7703b7b899c22eb04973d36655afd06ddf
            AND block_time  >= TIMESTAMP '2025-07-01'
      ),
      events AS (
          SELECT * FROM trades
          UNION ALL
          SELECT * FROM liquidations
      ),
      fees_daily AS (
          SELECT
              date_trunc('day', block_time) AS day,
              SUM(actual_fee)               AS daily_protocol_fees
          FROM events
          GROUP BY 1
      ),

      -- ===== Network fees from transactions (in STRK) =====
      txs AS (
          SELECT
              block_time,
              CAST(actual_fee_amount AS DECIMAL(38,0)) / 1e18 AS network_fees_strk
          FROM starknet.transactions
          WHERE version = 3
            AND block_date >= DATE '2025-07-01'
            AND sender_address = 0x048ddc53f41523d2a6b40c3dff7f69f4bbac799cd8b2e3fc50d3de1d4119441f
      ),
      network_daily AS (
          SELECT
              date_trunc('day', block_time) AS day,
              SUM(network_fees_strk)        AS daily_network_fees
          FROM txs
          GROUP BY 1
      ),

      -- ===== Daily STRK price in USD =====
      strk_price_daily AS (
          SELECT
              date_trunc('day', "timestamp") AS day,
              MAX(price)                     AS strk_usd_price
          FROM prices.day
          WHERE symbol = 'STRK'
            AND source = 'coinpaprika'
            AND "timestamp" >= TIMESTAMP '2025-07-01'
          GROUP BY 1
      ),

      -- ===== Combine fees =====
      combined AS (
          SELECT
              COALESCE(f.day, n.day) AS day,
              f.daily_protocol_fees,
              n.daily_network_fees
          FROM fees_daily f
          FULL OUTER JOIN network_daily n
            ON f.day = n.day
      )

      SELECT
          c.day,
          COALESCE(c.daily_protocol_fees, 0) AS daily_protocol_fees
      FROM combined c
      LEFT JOIN strk_price_daily p
        ON c.day = p.day
      LEFT JOIN trades_daily td
        ON c.day = td.day
        where c.day >= date '2025-08-01'
      ORDER BY c.day;
	`)

  const feeItem = data.find(item => item.day.split(' ')[0] === new Date(options.startOfDay * 1000).toISOString().split('T')[0])
  if (feeItem) {
    dailyFees.addUSDValue(feeItem.daily_protocol_fees);
  }

	return {
		dailyFees,
	};
};

const adapter: SimpleAdapter = {
	version: 1,
	dependencies: [Dependencies.DUNE],
	start: '2025-08-02',
  fetch,
  chains: [CHAIN.STARKNET],
	methodology: {
		Fees: "Tracks total fees paid traders while trading on Extended app.",
	},
}

export default adapter
