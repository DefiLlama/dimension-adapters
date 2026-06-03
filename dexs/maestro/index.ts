import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryAllium, getAlliumChain } from '../../helpers/allium';

const FEE_ADDRESS_EVM = '0xb0999731f7c2581844658a9d2ced1be0077b7397';
const SOLANA_FEE_ADDRESSES = [
  'MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36',
  'FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN',
];

const formatAddresses = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ');

async function fetchSolana(options: FetchOptions) {
  const feeAddressesSql = formatAddresses(SOLANA_FEE_ADDRESSES);

  const result = await queryAllium(`
    WITH maestro_txs AS (
      SELECT DISTINCT transaction_hash
      FROM solana.assets.transfers
      WHERE to_address IN (${feeAddressesSql})
        AND transfer_type = 'sol_transfer'
        AND raw_amount > 0
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    botTrades AS (
      SELECT
        t.transaction_hash,
        t.signer,
        t.usd_amount,
        ROW_NUMBER() OVER (
          PARTITION BY t.transaction_hash, t.signer
          ORDER BY t.usd_amount DESC
        ) AS row_num
      FROM solana.dex.trades t
      JOIN maestro_txs a ON t.transaction_hash = a.transaction_hash
      WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.signer NOT IN (${feeAddressesSql})
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
  `);

  return { dailyVolume: result[0].total_volume };
}

async function fetchEvm(options: FetchOptions) {
  const chainKey = getAlliumChain(options.chain);

  const result = await queryAllium(`
    WITH maestro_txs AS (
      SELECT DISTINCT transaction_hash
      FROM ${chainKey}.assets.native_token_transfers
      WHERE to_address = '${FEE_ADDRESS_EVM}'
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
      JOIN maestro_txs a ON t.transaction_hash = a.transaction_hash
      WHERE t.block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.transaction_from_address != '${FEE_ADDRESS_EVM}'
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
  `);

  return { dailyVolume: result[0].total_volume };
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  methodology: {
    Volume: 'Total USD trading volume of swaps routed through Maestro bot.',
  },
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-02-16' },
    [CHAIN.BSC]: { start: '2024-02-16' },
    [CHAIN.ARBITRUM]: { start: '2024-02-25' },
    [CHAIN.BASE]: { start: '2024-06-19' },
    [CHAIN.SONIC]: { start: '2025-02-26' },
    [CHAIN.AVAX]: { start: '2025-06-08' },
    [CHAIN.SOLANA]: { start: '2024-03-05' },
  },
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
