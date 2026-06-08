import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryAllium, getAlliumChain } from '../../helpers/allium';
import { queryDuneSql } from '../../helpers/dune';

const solanaFeeWallets = [
  'J5XGHmzrRmnYWbmw45DbYkdZAU2bwERFZ11qCDXPvFB5',
  'DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb',
];

const evmChainConfig: Record<string, { feeWallet: string }> = {
  [CHAIN.ETHEREUM]: {
    feeWallet: '0xa74FA823bC8617fa320A966b3d11B0f722eF09eE',
  },
  [CHAIN.BSC]: {
    feeWallet: '0x2b0A28A0A9197F8Af5d1B8371C048e92Dd78B640',
  },
  [CHAIN.BASE]: {
    feeWallet: '0x16388de42c5829fD0E88c8Eb001eF43bfc93F177',
  },
};

const formatAddresses = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ');

async function fetchSolana(options: FetchOptions) {
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const formattedFeeWallets = formatAddresses(solanaFeeWallets);

  const result = await queryDuneSql(options, `
    WITH tt_txs AS (
      SELECT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${formattedFeeWallets})
        AND balance_change > 0
    ),
    botTrades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      JOIN tt_txs a ON t.tx_id = a.tx_id
      WHERE TIME_RANGE
        AND t.trader_id NOT IN (${formattedFeeWallets})
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
  `);

  return { dailyVolume: result[0].total_volume };
}

async function fetchEvm(options: FetchOptions) {
  const config = evmChainConfig[options.chain];
  const chainKey = getAlliumChain(options.chain);
  const feeWallet = config.feeWallet.toLowerCase();

  const result = await queryAllium(`
    WITH tt_txs AS (
      SELECT DISTINCT transaction_hash
      FROM ${chainKey}.assets.native_token_transfers
      WHERE to_address = '${feeWallet}'
        AND transfer_type = 'value_transfer'
        AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    botTrades AS (
      SELECT
        t.transaction_hash,
        t.transaction_from_address,
        t.usd_amount,
        ROW_NUMBER() OVER (
          PARTITION BY t.transaction_hash, t.transaction_from_address
          ORDER BY t.usd_amount DESC
        ) AS row_num
      FROM ${chainKey}.dex.trades t
      JOIN tt_txs a ON t.transaction_hash = a.transaction_hash
      WHERE t.block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.transaction_from_address != '${feeWallet}'
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
  `);

  return { dailyVolume: result[0].total_volume };
}

const fetch: any = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  fetch,
  methodology: {
    Volume: 'Total USD trading volume of swaps routed through Trading Terminal.',
  },
  chains: [CHAIN.SOLANA, CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE],
  start: '2025-10-24',
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
