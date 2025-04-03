import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { queryDuneSql } from "../../helpers/dune";

interface DuneTradeData {
  blockchain: string;
  perpetuals_volume: string;
  perpetuals_fees: string;
  options_volume: string;
  options_fees: string;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const duneChainName = chain === CHAIN.ARBITRUM ? 'arbitrum' : 'polygon';
    
    const duneData: DuneTradeData[] = await queryDuneSql(options, `
      WITH all_trades AS (
          SELECT
              blockchain,
              volume_usd,
              fee_usd AS fees,
              block_time,
              'perpetuals' AS class
          FROM
              tigris.perpetual_trades
          WHERE TIME_RANGE

          UNION ALL

          SELECT
              blockchain,
              volume_usd,
              fees,
              evt_block_time AS block_time,
              'options' AS class
          FROM
              tigris.options_trades
          WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time <= from_unixtime(${options.endTimestamp})
      ),
      daily_summary AS (
          SELECT
              blockchain,
              SUM(CASE WHEN class = 'perpetuals' THEN volume_usd ELSE 0 END) AS perpetuals_volume,
              SUM(CASE WHEN class = 'perpetuals' THEN fees ELSE 0 END) AS perpetuals_fees,
              SUM(CASE WHEN class = 'options' THEN volume_usd ELSE 0 END) AS options_volume,
              SUM(CASE WHEN class = 'options' THEN fees ELSE 0 END) AS options_fees
          FROM
              all_trades
          GROUP BY
              blockchain
      )
      SELECT
          blockchain,
          perpetuals_volume,
          perpetuals_fees,
          options_volume,
          options_fees
      FROM
          daily_summary
      WHERE blockchain = '${duneChainName}';
    `);

    const chainData = duneData?.[0] ?? {
      perpetuals_fees: '0',
      options_fees: '0',
      perpetuals_volume: '0',
      options_volume: '0'
    };
    
    const totalFees = Number(chainData.perpetuals_fees) + Number(chainData.options_fees);
    const totalVolume = Number(chainData.perpetuals_volume) + Number(chainData.options_volume);

    return {
      timestamp: getTimestampAtStartOfDayUTC(timestamp),
      dailyFees: totalFees.toString(),
      dailyRevenue: totalFees.toString()
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2022-09-13',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: '2022-09-13',
    }
  }
};

export default adapter;