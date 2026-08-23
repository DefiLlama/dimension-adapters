import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

// source: https://dune.com/queries/5682491
// NOTICE: when copy from dune, replace block_time with TIME_RANGE

const sql = `
WITH solana_transfers AS (
  SELECT
    COALESCE(SUM(amount_usd), 0) AS solana_trading_fees_usd
  FROM tokens_solana.transfers
  WHERE
    to_owner = 'FUzZ2SPwLPAKaHubxQzRsk9K8dXb4YBMR6hTrYEMFFZc'
    AND TIME_RANGE
), evm_transfers AS (
  SELECT
    COALESCE(SUM(CASE WHEN blockchain = 'ethereum' THEN amount_usd ELSE 0 END), 0) AS ethereum_trading_fees_usd,
    COALESCE(SUM(CASE WHEN blockchain = 'base' THEN amount_usd ELSE 0 END), 0) AS base_trading_fees_usd,
    COALESCE(SUM(CASE WHEN blockchain = 'bnb' THEN amount_usd ELSE 0 END), 0) AS bnb_trading_fees_usd,
    COALESCE(SUM(CASE WHEN blockchain = 'robinhood' THEN amount_usd ELSE 0 END), 0) AS robinhood_trading_fees_usd,
    COALESCE(SUM(CASE WHEN blockchain = 'monad' THEN amount_usd ELSE 0 END), 0) AS monad_trading_fees_usd,
    COALESCE(SUM(CASE WHEN blockchain = 'hyperevm' THEN amount_usd ELSE 0 END), 0) AS hyperevm_trading_fees_usd
  FROM tokens.transfers
  WHERE
    (
      (
        blockchain IN ('ethereum', 'robinhood', 'monad', 'hyperevm')
        AND "to" IN (0x4BfD6d43CB67E26eC8418a995142cE2c19Db7B13, 0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4)
      )
      OR (
        blockchain = 'base'
        AND "to" IN (0xc98218Df72975EE1472919d2685e5BD215Baaad4, 0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4)
      )
      OR (
        blockchain = 'bnb'
        AND "to" IN (0x68AF11c8A93B373BA97217963878B097083726f0, 0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4)
      )
    )
    AND TIME_RANGE
    AND tx_from <> "to"
)

SELECT
  (
    solana.solana_trading_fees_usd
    + evm.ethereum_trading_fees_usd
    + evm.base_trading_fees_usd
    + evm.bnb_trading_fees_usd
    + evm.robinhood_trading_fees_usd
    + evm.monad_trading_fees_usd
    + evm.hyperevm_trading_fees_usd
  ) AS combined_trading_fees_usd,
  (
    solana.solana_trading_fees_usd
    + evm.ethereum_trading_fees_usd
    + evm.base_trading_fees_usd
    + evm.bnb_trading_fees_usd
    + evm.robinhood_trading_fees_usd
    + evm.monad_trading_fees_usd
    + evm.hyperevm_trading_fees_usd
  ) * 100 AS combined_trading_volume_usd,
  solana.solana_trading_fees_usd,
  solana.solana_trading_fees_usd * 100 AS solana_trading_volume_usd,
  evm.ethereum_trading_fees_usd,
  evm.ethereum_trading_fees_usd * 100 AS ethereum_trading_volume_usd,
  evm.base_trading_fees_usd,
  evm.base_trading_fees_usd * 100 AS base_trading_volume_usd,
  evm.bnb_trading_fees_usd,
  evm.bnb_trading_fees_usd * 100 AS bnb_trading_volume_usd,
  evm.robinhood_trading_fees_usd,
  evm.robinhood_trading_fees_usd * 100 AS robinhood_trading_volume_usd,
  evm.monad_trading_fees_usd,
  evm.monad_trading_fees_usd * 100 AS monad_trading_volume_usd,
  evm.hyperevm_trading_fees_usd,
  evm.hyperevm_trading_fees_usd * 100 AS hyperevm_trading_volume_usd
FROM solana_transfers AS solana
CROSS JOIN evm_transfers AS evm
`;

const chainColumnMap: Record<string, { fees: string; volume: string }> = {
  [CHAIN.SOLANA]: { fees: 'solana_trading_fees_usd', volume: 'solana_trading_volume_usd' },
  [CHAIN.ETHEREUM]: { fees: 'ethereum_trading_fees_usd', volume: 'ethereum_trading_volume_usd' },
  [CHAIN.BASE]: { fees: 'base_trading_fees_usd', volume: 'base_trading_volume_usd' },
  [CHAIN.BSC]: { fees: 'bnb_trading_fees_usd', volume: 'bnb_trading_volume_usd' },
  [CHAIN.ROBINHOOD]: { fees: 'robinhood_trading_fees_usd', volume: 'robinhood_trading_volume_usd' },
  [CHAIN.MONAD]: { fees: 'monad_trading_fees_usd', volume: 'monad_trading_volume_usd' },
  [CHAIN.HYPERLIQUID]: { fees: 'hyperevm_trading_fees_usd', volume: 'hyperevm_trading_volume_usd' },
};

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, sql);
};

const fetch = async (options: FetchOptions) => {
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
    [CHAIN.ETHEREUM]: {
      start: '2026-04-17',
    },
    [CHAIN.BASE]: {
      start: '2025-08-15',
    },
    [CHAIN.BSC]: {
      start: '2026-02-01',
    },
    [CHAIN.ROBINHOOD]: {
      start: '2026-07-28',
    },
    [CHAIN.MONAD]: {
      start: '2026-08-01',
    },
    [CHAIN.HYPERLIQUID]: {
      start: '2026-08-06',
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  doublecounted: true,
};

export default adapter;
