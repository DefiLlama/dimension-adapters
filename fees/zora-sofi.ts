import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getZoraCoinsData } from "../dexs/zora-sofi";

// interface IDuneUSDResult {
//   trade_fees_usd: number | null;
//   market_fees_usd: number | null;
//   protocol_revenue_usd: number | null;
//   total_fees_usd: number | null;
// }

// const fetch = async (_a: any, _b: any, options: FetchOptions) => {
//   const dailyFees = options.createBalances();
//   const dailyRevenue = options.createBalances();

//   const feesRes: IDuneUSDResult[] = await queryDuneSql(options, `
//     WITH trade_fees_daily AS (
//       SELECT
//         evt_block_time,
//         currency,
//         (coalesce(creatorReward, 0) + coalesce(platformReferrerReward, 0) + coalesce(traderReferrerReward, 0) + coalesce(protocolReward, 0)) as fee_atomic,
//         protocolReward as protocol_atomic
//       FROM zora_base.coin_evt_cointraderewards
//       WHERE
//         evt_block_time >= from_unixtime(${options.startTimestamp})
//         AND evt_block_time < from_unixtime(${options.endTimestamp})
//     ),
//     market_fees_daily AS (
//       SELECT
//         evt_block_time,
//         currency,
//         CAST(json_value(marketRewards, 'lax $.totalAmountCurrency') AS DECIMAL) AS fee_atomic,
//         CAST(json_value(marketRewards, 'lax $.protocolAmountCurrency') AS DECIMAL) AS protocol_atomic
//       FROM zora_base.coin_evt_coinmarketrewards
//       WHERE
//         evt_block_time >= from_unixtime(${options.startTimestamp})
//         AND evt_block_time < from_unixtime(${options.endTimestamp})
//     ),
//     trade_fees_usd AS (
//         SELECT
//             sum(tf.fee_atomic / pow(10, p.decimals) * p.price) as total_fees_usd,
//             sum(tf.protocol_atomic / pow(10, p.decimals) * p.price) as protocol_revenue_usd
//         FROM trade_fees_daily tf
//         JOIN prices.usd p ON tf.currency = p.contract_address
//           AND p.blockchain = 'base'
//           AND p.minute = date_trunc('minute', tf.evt_block_time)
//           AND p.minute >= from_unixtime(${options.startTimestamp})
//           AND p.minute < from_unixtime(${options.endTimestamp})
//     ),
//     market_fees_usd AS (
//         SELECT
//             sum(mf.fee_atomic / pow(10, p.decimals) * p.price) as total_fees_usd,
//             sum(mf.protocol_atomic / pow(10, p.decimals) * p.price) as protocol_revenue_usd
//         FROM market_fees_daily mf
//         JOIN prices.usd p ON mf.currency = p.contract_address
//           AND p.blockchain = 'base'
//           AND p.minute = date_trunc('minute', mf.evt_block_time)
//           AND p.minute >= from_unixtime(${options.startTimestamp})
//           AND p.minute < from_unixtime(${options.endTimestamp})
//     )
//     SELECT
//       (SELECT total_fees_usd FROM trade_fees_usd) as trade_fees_usd,
//       (SELECT total_fees_usd FROM market_fees_usd) as market_fees_usd,
//       (coalesce((SELECT protocol_revenue_usd FROM trade_fees_usd),0) + coalesce((SELECT protocol_revenue_usd FROM market_fees_usd),0)) as protocol_revenue_usd,
//       (coalesce((SELECT total_fees_usd FROM trade_fees_usd),0) + coalesce((SELECT total_fees_usd FROM market_fees_usd),0)) as total_fees_usd
//   `);

//   if (feesRes.length > 0) {
//     const result = feesRes[0];
//     const tf = result.total_fees_usd || 0;
//     const protocolRevenue = result.protocol_revenue_usd || 0;

//     dailyFees.addCGToken('usd', tf);
//     dailyRevenue.addCGToken('usd', protocolRevenue);
//   }

//   return {
//     dailyFees,
//     dailyRevenue,
//     dailyProtocolRevenue: dailyRevenue,
//     dailyUserFees: dailyFees
//   }
// }

const methodology = {
  Fees: "All fees from trading coins, including: 1% Trade Rewards fee on direct Zora trades (0.5% to Creator, 0.15% to Trade Referrer, 0.15% to Create Referrer, 0.2% to Zora) and 1% Market Rewards fee on initial Uniswap market trades (0.5% to Creator, 0.25% to Create Referrer, 0.25% to Zora)",
  UserFees: "All fees paid by users when trading coins.",
  Revenue: "All trading fees on Zora are revenue.",
  ProtocolRevenue: "Portion of fees that go to the Zora protocol."
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: async function fetch(options: FetchOptions): Promise<FetchResultV2> {
        return await getZoraCoinsData(options, 'fees');
      },
      start: '2025-02-19',
    },
  },
  methodology,
  isExpensiveAdapter: true
}

export default adapter;
