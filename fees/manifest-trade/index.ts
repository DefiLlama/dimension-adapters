import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { queryAllium } from '../../helpers/allium';
import { timeFilter } from '../../helpers/alliumSolanaEvents';
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";

// https://github.com/Bonasa-Tech/manifest/blob/ff62612100a82a46babb646fc312ab9ceea041db/programs/manifest/src/program/processor/defrag.rs#L24
const COLLECTOR = 'B6dmr2UAn2wgjdm3T4N1Vjd8oPYRRTguByW7AEngkeL6';
const MANIFEST_PROGRAM = 'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms';
const WRAPPER_PROGRAM = 'wMNFSTkir3HgyZTsB7uqu3i7FA73grFCptPXgrZjksL';
const UI_WRAPPER_PROGRAM = 'UMnFStVeG1ecZFc2gc5K3vFy3sMpotq8C91mXBQDGwh';
const UPGRADEABLE_LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';

const METRIC = {
  WRAPPER_SWEEPS: 'Wrapper Account Sweeps',
  MARKET_SWEEPS: 'Market Account Sweeps',
  DIRECT_PAYMENTS: 'Direct SOL Payments',
};

const fetch = async (options: FetchOptions) => {
  const has = (program: string) => `ARRAY_CONTAINS('${program}'::VARIANT, keys)`;
  const rows = await queryAllium(`
    WITH txs AS (
      SELECT signer, keys,
        post_balances[ARRAY_POSITION('${COLLECTOR}'::VARIANT, keys)]::NUMBER
          - pre_balances[ARRAY_POSITION('${COLLECTOR}'::VARIANT, keys)]::NUMBER AS delta
      FROM (
        SELECT signer, pre_balances, post_balances, TRANSFORM(account_keys, k -> k:pubkey) AS keys
        FROM solana.raw.transactions
        WHERE ${timeFilter(options)}
          AND success = true
          AND ARRAY_CONTAINS('${COLLECTOR}'::VARIANT, TRANSFORM(account_keys, k -> k:pubkey))
      )
    ),
    sources AS (
      SELECT delta,
        CASE
          WHEN ${has(UPGRADEABLE_LOADER)} THEN NULL
          WHEN signer = '${COLLECTOR}' AND ${has(WRAPPER_PROGRAM)} THEN 'wrapper'
          WHEN signer = '${COLLECTOR}' AND ${has(MANIFEST_PROGRAM)} THEN 'market'
          WHEN signer <> '${COLLECTOR}' AND (${has(MANIFEST_PROGRAM)} OR ${has(WRAPPER_PROGRAM)} OR ${has(UI_WRAPPER_PROGRAM)}) THEN 'direct'
        END AS source
      FROM txs
      WHERE delta > 0
    )
    SELECT
      COALESCE(SUM(IFF(source = 'wrapper', delta, 0)), 0) AS wrapper_lamports,
      COALESCE(SUM(IFF(source = 'market', delta, 0)), 0) AS market_lamports,
      COALESCE(SUM(IFF(source = 'direct', delta, 0)), 0) AS direct_lamports,
      -- the transfers table, built from the raw ones, already holds blocks past the window, so a quiet
      -- window is not ingestion lag
      EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    FROM sources
  `);

  const row = rows[0];
  if (!row?.indexed)
    throw new Error(`manifest-trade: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, row.wrapper_lamports, METRIC.WRAPPER_SWEEPS);
  dailyFees.add(ADDRESSES.solana.SOL, row.market_lamports, METRIC.MARKET_SWEEPS);
  dailyFees.add(ADDRESSES.solana.SOL, row.direct_lamports, METRIC.DIRECT_PAYMENTS);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "SOL received by the Manifest fee collector from Manifest transactions: per-order wrapper fees, advanced-order fees, forfeited gas deposits of cleaned orders, account deposits (rent) released when the protocol compacts or closes market and wrapper accounts, and SOL users send to the collector directly. Excludes rent refunded to the collector by program upgrades.",
  Revenue: "All SOL received by the Manifest fee collector is kept by the protocol: per-order wrapper and advanced-order fees, forfeited gas deposits, released account deposits and direct user payments.",
  ProtocolRevenue: "All SOL received by the Manifest fee collector goes to the protocol: per-order wrapper and advanced-order fees, forfeited gas deposits, released account deposits and direct user payments.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.WRAPPER_SWEEPS]: "SOL swept from traders' wrapper accounts by the collector: the flat wrapper fee charged on every wrapper order batch, plus account deposits released when wrapper accounts are compacted.",
    [METRIC.MARKET_SWEEPS]: "SOL swept from market accounts by the collector: the 5,000-lamport fee on order batches that place global or reverse orders, forfeited gas deposits of cleaned global orders, and account deposits released when markets are compacted or closed.",
    [METRIC.DIRECT_PAYMENTS]: "SOL users send straight to the collector inside Manifest transactions.",
  },
  Revenue: {
    [METRIC.WRAPPER_SWEEPS]: "Wrapper fees and released wrapper account deposits, kept by the protocol.",
    [METRIC.MARKET_SWEEPS]: "Advanced-order fees, forfeited gas deposits and released market account deposits, kept by the protocol.",
    [METRIC.DIRECT_PAYMENTS]: "SOL users send straight to the collector, kept by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.WRAPPER_SWEEPS]: "Wrapper fees and released wrapper account deposits, sent to the protocol's collector wallet.",
    [METRIC.MARKET_SWEEPS]: "Advanced-order fees, forfeited gas deposits and released market account deposits, sent to the protocol's collector wallet.",
    [METRIC.DIRECT_PAYMENTS]: "SOL users send straight to the collector, held by the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
  start: '2026-09-28',
};

export default adapter;
