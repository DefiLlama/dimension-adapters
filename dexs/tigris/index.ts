import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

interface DuneTradeData {
  blockchain: string;
  perpetuals_volume: string;
  options_volume: string;
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const duneChainName = chain === CHAIN.ARBITRUM ? 'arbitrum' : 'polygon';
    
    const duneData: DuneTradeData[] = await queryDuneSql(options, `
      WITH all_trades AS (
          SELECT
              blockchain,
              volume_usd,
              block_time,
              'perpetuals' AS class
          FROM
              tigris.perpetual_trades
          WHERE TIME_RANGE

          UNION ALL

          SELECT
              blockchain,
              volume_usd,
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
              SUM(CASE WHEN class = 'options' THEN volume_usd ELSE 0 END) AS options_volume
          FROM
              all_trades
          GROUP BY
              blockchain
      )
      SELECT
          blockchain,
          perpetuals_volume,
          options_volume
      FROM
          daily_summary
      WHERE blockchain = '${duneChainName}';
    `);

    const chainData = duneData?.[0] ?? {
      perpetuals_volume: '0',
      options_volume: '0'
    };
    
    const totalVolume = Number(chainData.perpetuals_volume) + Number(chainData.options_volume);

    return {
      dailyVolume: totalVolume.toString(),
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
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