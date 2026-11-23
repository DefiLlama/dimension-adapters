import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

interface IData {
  day: string;
  daily_trading_fees: number;
  daily_liquidation_fees: number;
}

interface IMarketStats {
  date: string;
  marketId: number;
  tradingVolume: string;
  fees?: string;
}

// Starknet: per-trade fees from Extended's trading contract events (Trade = both sides' fees, Liquidation = liquidation fee)
const fetchStarknet = async (options: FetchOptions) => {
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
            AND TIME_RANGE
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
            AND TIME_RANGE
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
            AND TIME_RANGE
      ),
      trades_fees_daily AS (
          SELECT
              date_trunc('day', block_time) AS day,
              SUM(actual_fee)               AS daily_trading_fees
          FROM trades
          GROUP BY 1
      ),
      liquidations_fees_daily AS (
          SELECT
              date_trunc('day', block_time) AS day,
              SUM(actual_fee)               AS daily_liquidation_fees
          FROM liquidations
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
            AND TIME_RANGE
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
              COALESCE(t.day, l.day, n.day) AS day,
              t.daily_trading_fees,
              l.daily_liquidation_fees,
              n.daily_network_fees
          FROM trades_fees_daily t
          FULL OUTER JOIN liquidations_fees_daily l
            ON t.day = l.day
          FULL OUTER JOIN network_daily n
            ON COALESCE(t.day, l.day) = n.day
      )

      SELECT
          c.day,
          COALESCE(c.daily_trading_fees, 0)     AS daily_trading_fees,
          COALESCE(c.daily_liquidation_fees, 0) AS daily_liquidation_fees
      FROM combined c
      LEFT JOIN strk_price_daily p
        ON c.day = p.day
      LEFT JOIN trades_daily td
        ON c.day = td.day
        where c.day >= date '2025-08-01'
      ORDER BY c.day;
  `)

  const feeItem = data.find(item => item.day.split(' ')[0] === options.dateString)
  if (!feeItem) throw new Error(`Extended: no Starknet fee row for ${options.dateString}`)
  dailyFees.addUSDValue(feeItem.daily_trading_fees, METRIC.TRADING_FEES);
  dailyFees.addUSDValue(feeItem.daily_liquidation_fees, METRIC.LIQUIDATION_FEES);

  return { dailyFees };
};

const fetchArc = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const date = options.dateString
  const { data }: { data: IMarketStats[] } = await fetchURL(`https://api.starknet.extended.exchange/api/v1/exchange/stats/trading?fromDate=${date}&toDate=${date}`)
  if (!data?.length) throw new Error(`Extended stats API returned no markets for ${date}`)

  let fees = 0
  let volume = 0
  for (const market of data) {
    if (market.date !== date) throw new Error(`Extended stats API returned ${market.date} for ${date}`)
    if (market.fees === undefined) throw new Error(`Extended stats API is missing fees for market ${market.marketId} on ${date}`)
    fees += Number(market.fees)
    volume += Number(market.tradingVolume)
  }
  // the API serves fees "0" on days it has not computed fees for, which must not be stored as a real $0
  if (volume > 0 && fees === 0) throw new Error(`Extended stats API reports volume but no fees for ${date}`)

  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES)
  return { dailyFees };
};

const methodology = {
  Fees: "Trading and liquidation fees paid by traders on Extended perpetuals. Until 2026-10-21 they are summed from the per-trade fee (Trade events) and liquidation fee (Liquidation events) fields of Extended's trading contract on Starknet. From 2026-10-22, when settlement moved to Arc, which posts no per-trade fees on-chain, they are the daily fees reported by Extended's stats API. Per Extended's fee schedule, takers pay 0.025% and makers pay 0.000% with a tiered rebate up to 0.013% based on 30-day maker market share. Maker rebates are accrued to internal Extended sub-accounts rather than paid out on-chain, so they cannot be separately attributed and are not netted from this value. Revenue is therefore left unreported rather than implicitly equated to fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees charged on perpetual trades on Extended. On Arc this is the single daily fee total reported by Extended's stats API, which may include liquidation fees.",
    [METRIC.LIQUIDATION_FEES]: "Fees charged when positions are liquidated on Extended, read from Starknet Liquidation events. Arc reports one fee total, so from 2026-10-22 they are not split out.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetchStarknet,
      start: '2025-08-02',
      // settlement moved from Starknet to Arc on 2026-10-22 (~13:00 UTC). The stats API's 10-22 fees cover the whole day,
      // so that day is counted on Arc only. The runner still runs the deadFrom day, so 10-21 is the last Starknet day.
      deadFrom: '2026-10-21',
    },
    [CHAIN.ARC]: {
      fetch: fetchArc,
      start: '2026-10-22',
    },
  },
  skipBreakdownValidation: true, // no revenue attribution breakdown
  methodology,
  breakdownMethodology,
  unknownBreakdownMethodology: {
    SupplySideRevenue: {
      'Maker Rebates': 'Makers earn rebates of up to 0.013% of volume, tiered on their 30-day maker market share, credited to internal accounts rather than paid onchain.',
    },
  },
}

export default adapter
