import { Adapter, Dependencies, FetchOptions } from "../adapters/types"
import { CHAIN } from '../helpers/chains'
import { queryDuneSql } from "../helpers/dune"

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const query = `
WITH trades AS (
      SELECT
        block_time,
        DATE_TRUNC('day', block_time) AS block_date,
        CAST(user AS VARCHAR) AS user,
        CAST(tx_hash AS VARCHAR) AS tx_hash,
        COALESCE(fee, 0) AS fee,
        sizeDelta
      FROM query_6511128
      WHERE blockchain = 'Arbitrum'
    ), vaultInteractions AS (
      SELECT
        block_time,
        DATE_TRUNC('day', block_time) AS block_date,
        CAST(user AS VARCHAR) AS user,
        CAST(tx_hash AS VARCHAR) AS tx_hash,
        0 AS fee,
        0 AS sizeDelta
      FROM query_6512731
      WHERE blockchain = 'Arbitrum'
    ), integrator_volume AS (
      SELECT
        DATE_TRUNC('day', "Date") AS block_date,
        "volumeUSD" AS integrator_volume
      FROM query_4060867
    ), gains_trade_referral_volume_daily AS (
      SELECT
        DATE_TRUNC('day', ref_orders.block_time) AS block_date,
        SUM(
          ref_orders.position_size_dai * ref_orders.leverage * ref_orders.collateralPriceUsd
        ) AS gains_volume_usd
      FROM gains_network_arbitrum.GNSMultiCollatDiamond_evt_ReferrerRewardDistributed AS ref_events
      JOIN query_3388490 AS ref_orders
        ON ref_events.evt_tx_hash = ref_orders.tx_hash
      WHERE
        ref_events.referrer = 0x8c128f336b479b142429a5f351af225457a987fa
      GROUP BY 1
    ), hyperliquid_referral_volume_daily AS (
      SELECT
        DATE_TRUNC('day', TRY_CAST(date AS DATE)) AS block_date,
        SUM(volume) AS hyperliquid_volume_usd,
        SUM(fees) AS hyperliquid_fees_usd
      FROM query_5808723
      GROUP BY 1
    ), tradesAndVaultInteractions AS (
      SELECT *
      FROM trades
      UNION ALL
      SELECT *
      FROM vaultInteractions
    ), activityByDay AS (
      SELECT
        tavi.block_date,
        SUM(tavi.sizeDelta) AS platform_volumeUSD,
        COALESCE(MAX(iv.integrator_volume), 0) AS integrator_volumeUSD,
        SUM(tavi.fee) AS totalFeesUSD
      FROM tradesAndVaultInteractions AS tavi
      LEFT JOIN integrator_volume AS iv
        ON tavi.block_date = iv.block_date
      GROUP BY tavi.block_date
    ), combined_data AS (
      SELECT
        abd.block_date,
        abd.platform_volumeUSD,
        abd.integrator_volumeUSD,
        COALESCE(gtv.gains_volume_usd, 0) AS gains_volumeUSD,
        COALESCE(hlv.hyperliquid_volume_usd, 0) AS hyperliquid_volumeUSD,
        (
          abd.platform_volumeUSD + abd.integrator_volumeUSD + COALESCE(gtv.gains_volume_usd, 0) + COALESCE(hlv.hyperliquid_volume_usd, 0)
        ) AS volumeUSD,
        abd.totalFeesUSD + COALESCE(hlv.hyperliquid_fees_usd, 0) AS totalFeesUSD
      FROM activityByDay AS abd
      LEFT JOIN gains_trade_referral_volume_daily AS gtv
        ON abd.block_date = gtv.block_date
      LEFT JOIN hyperliquid_referral_volume_daily AS hlv
        ON abd.block_date = hlv.block_date
    )
    SELECT
      block_date,
      volumeUSD,
      totalFeesUSD
    FROM combined_data
    WHERE DATE_TRUNC('day', block_date) = DATE_TRUNC('day', FROM_UNIXTIME(${timestamp}))
    ORDER BY block_date DESC
  `;

  const result = await queryDuneSql(options, query);

  if (!result || result.length === 0) {
    return {
      dailyVolume: '0',
      dailyFees: '0',
      dailyUserFees: '0',
      dailyRevenue: '0',
      dailyProtocolRevenue: '0',
      dailySupplySideRevenue: '0',
    };
  }

  const dailyVolume = result[0].volumeUSD || 0;
  const dailyFees = result[0].totalFeesUSD || 0;

  return {
    dailyVolume: dailyVolume.toString(),
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyHoldersRevenue: (dailyFees * 0.65).toString(),
    dailyProtocolRevenue: dailyFees.toString(),
    dailySupplySideRevenue: (dailyFees * 0.20).toString(),
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-10-09',
    },
  },
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Fees collected from user trading fees",
    Revenue: "Fees going to the treasury + holders",
    SupplySideFees: "Fees going to liquidity providers of the protocol",
  },
}

export default adapter
