import {
  Dependencies,
  Fetch,
  FetchOptions,
  FetchResult,
  FetchV2,
  SimpleAdapter
} from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const arbitrumStartTimestamp = '2023-10-11'; // 2023-10-11 00:00:00

type StatRow = {
  volume_24hr: number;
  fees_24hr: number;
  total_volume: number;
  total_fees: number;
};

const chainsMap: Record<string, string> = {
  ARBITRUM: "arbitrum",
};

const fetchVolumeAndFees: (chain: string) => FetchV2 =
  (chain: string) =>
    async (options: FetchOptions): Promise<FetchResult> => {
      chain;

      const daytime = new Date(options.startOfDay * 1000).toISOString();

      // throw new Error('Dune query is broken, fix it by turning adapter on chain')
      // https://dune.com/queries/3855069
      let data = (
        await queryDuneSql(options, `
        WITH
          PERPIE_TRADES_DAILY AS (
            SELECT
              volume_date,
              daily_volume
            FROM
              query_3289719
          ),
          PERPIE_FEES_DAILY AS (
            SELECT
              transfer_date,
              usd_total
            FROM
              query_3289650
          ),
          volume_24hr AS (
            SELECT
              SUM(daily_volume) AS volume_24hr
            FROM
              PERPIE_TRADES_DAILY
            WHERE
              volume_date = DATE_TRUNC('day', CAST('${daytime}' AS TIMESTAMP))
          ),
          total_volume AS (
            SELECT
              SUM(daily_volume) AS total_volume
            FROM
              PERPIE_TRADES_DAILY
          ),
          fees_24hr AS (
            SELECT
              SUM(usd_total) AS fees_24hr
            FROM
              PERPIE_FEES_DAILY
            WHERE
              transfer_date = DATE_TRUNC('day', CAST('${daytime}' AS TIMESTAMP))
          ),
          total_fees AS (
            SELECT
              SUM(usd_total) AS total_fees
            FROM
              PERPIE_FEES_DAILY
          )
        SELECT
          volume_24hr.volume_24hr,
          total_volume.total_volume,
          fees_24hr.fees_24hr,
          total_fees.total_fees
        FROM
          volume_24hr,
          total_volume,
          fees_24hr,
          total_fees
        `
        )
      )[0] as StatRow;

      return {
        dailyVolume: data.volume_24hr || 0,
        dailyRevenue: data.fees_24hr || 0,
      };
    };

const fetchAll: (chain: string) => Fetch =
  (chain: string) =>
    async (_a: any, _t: any, options: FetchOptions): Promise<FetchResult> => {
      const volumeAndFees = await fetchVolumeAndFees(chain)(options);
      return { ...volumeAndFees } as FetchResult;
    };

const adapter: SimpleAdapter = {
  deadFrom: '2024-11-24',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          start: arbitrumStartTimestamp,
          fetch: fetchAll(chain),
        },
      };
    }, {}),
  },
};

export default adapter;
