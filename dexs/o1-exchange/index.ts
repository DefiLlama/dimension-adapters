import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

// source: https://dune.com/queries/5682491

const sql = `
  WITH solana_transfers AS (
    SELECT
      SUM(amount_usd) AS trading_fees_usd,
      SUM(amount_usd) * 100 AS trading_volume_usd
    FROM tokens_solana.transfers
    WHERE
      to_owner = 'FUzZ2SPwLPAKaHubxQzRsk9K8dXb4YBMR6hTrYEMFFZc'
      AND TIME_RANGE
  ), base_transfers AS (
    SELECT
      SUM(amount_usd) AS trading_fees_usd,
      SUM(amount_usd) * 100 AS trading_volume_usd
    FROM tokens_base.transfers
    WHERE
      (
        "to" IN (0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4, 0xc98218Df72975EE1472919d2685e5BD215Baaad4)
        AND TIME_RANGE
        AND tx_from <> "to"
      )
  )
  SELECT
    COALESCE(solana.trading_fees_usd, 0) AS solana_trading_fees_usd,
    COALESCE(solana.trading_volume_usd, 0) AS solana_trading_volume_usd,
    COALESCE(base.trading_fees_usd, 0) AS base_trading_fees_usd,
    COALESCE(base.trading_volume_usd, 0) AS base_trading_volume_usd
  FROM solana_transfers AS solana
  FULL OUTER JOIN base_transfers AS base ON 1=1
`;

const chainColumnMap: Record<string, { fees: string; volume: string }> = {
  [CHAIN.SOLANA]: { fees: 'solana_trading_fees_usd', volume: 'solana_trading_volume_usd' },
  [CHAIN.BASE]: { fees: 'base_trading_fees_usd', volume: 'base_trading_volume_usd' },
};

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, sql);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = options.preFetchedResults[0];
  const cols = chainColumnMap[options.chain];

  const dailyFees = data[cols.fees];
  const dailyVolume = data[cols.volume];

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: 'Total trading volume is calculated as fees multiplied by 100, since trading fees are 1% of the volume.',
  Fees: 'User pays 1% fee on each trade',
  UserFees: 'User pays 1% fee on each trade',
  Revenue: 'All trading fees are revenue.',
  ProtocolRevenue: 'All trading fees are revenue collected by o1 exchange.',
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  prefetch,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2025-07-01',
    },
    [CHAIN.BASE]: {
      start: '2025-08-15',
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
};

export default adapter;
