import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const HNT_MINT = 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux';
const DC_MINT = 'dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm';
const DC_PER_USD = 1e5; // Data Credits are pegged at $0.00001

// Nova Labs ended the HNT buyback on 2026-01-02
const BUYBACK_END = 1767312000; // 2026-01-02 00:00 UTC
// Mobile payer rate cut from $0.50/GB to ~$0.10/GB (HIP-149); burns at the new rate start 2026-06-04 17:00 UTC
const DC_BURN_START = 1780592400;

// buyz... ran the DCA until 2025-11-26, then 2j65... (counted from 2025-11-26 to skip a one-time $181.9k seed on 2025-11-20)
const BUYBACK_WALLETS = `(
  to_address = 'buyzuS9fLSBqkmNCHbmQP4SB72zSfAzPb3Cr9iFRhtM'
  OR (to_address = '2j65rdW1jZvrEUx1xzC9ctcVbDW9smw2TUMhp3REFhNR' AND block_timestamp >= '2025-11-26')
)`;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  if (options.startTimestamp < BUYBACK_END || options.endTimestamp > DC_BURN_START) {
    const [row] = await queryAllium(`
      WITH checks AS (
        SELECT EXISTS (SELECT 1 FROM solana.assets.transfers
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
            AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
      ),
      totals AS (
        SELECT
          COALESCE(SUM(IFF(mint = '${DC_MINT}' AND type = 'burn' AND block_timestamp >= TO_TIMESTAMP_NTZ(${DC_BURN_START}), raw_amount, 0)), 0) / ${DC_PER_USD} AS dc_burned_usd,
          COALESCE(SUM(IFF(mint = '${HNT_MINT}' AND block_timestamp < TO_TIMESTAMP_NTZ(${BUYBACK_END}) AND ${BUYBACK_WALLETS}, usd_amount, 0)), 0) AS buyback_usd
        FROM solana.assets.transfers
        WHERE mint IN ('${DC_MINT}', '${HNT_MINT}')
          AND (type = 'burn' OR ${BUYBACK_WALLETS})
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      )
      SELECT c.indexed, t.dc_burned_usd, t.buyback_usd FROM checks c CROSS JOIN totals t
    `);
    if (!row?.indexed) throw new Error(`helium: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);

    dailyFees.addUSDValue(Number(row.buyback_usd), 'HNT Buyback');
    dailyFees.addUSDValue(Number(row.dc_burned_usd), 'Data Credits Burned');
    dailyRevenue.addUSDValue(Number(row.buyback_usd), 'HNT Buyback');
    dailyRevenue.addUSDValue(Number(row.dc_burned_usd), 'HNT Burned For Data Credits');
    dailyHoldersRevenue.addUSDValue(Number(row.buyback_usd), 'HNT Buyback');
    dailyHoldersRevenue.addUSDValue(Number(row.dc_burned_usd), 'HNT Burned For Data Credits');
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Fees: 'Data Credits burned to pay for Helium network usage (Mobile data offload, IoT data transfer and other Data Credit payments), valued at the $0.00001 Data Credit peg, from 2026-06-04 17:00 UTC, when Nova cut the Mobile payer rate from $0.50/GB to ~$0.10/GB (HIP-149) so the burn matches what carriers pay. Before the cut the Mobile burn was priced at $0.50/GB, about 5x what carriers paid, so it is excluded: from 2025-10-21 to 2026-01-01 we count the open-market HNT buyback (Jupiter DCA) Helium Mobile burned instead, and 2026-01-02 to 2026-06-04 is 0.',
  Revenue: 'HNT burned to mint the Data Credits spent on network usage (from 2026-06-04 17:00 UTC), plus the open-market HNT buyback until 2026-01-02.',
  ProtocolRevenue: 'No protocol revenue: all value goes to HNT holders through burns.',
  HoldersRevenue: 'HNT burned to mint the Data Credits spent on network usage (from 2026-06-04 17:00 UTC), plus the open-market HNT buyback until 2026-01-02; both reduce HNT supply.',
};

const breakdownMethodology = {
  Fees: {
    'HNT Buyback': 'Open-market HNT bought by Helium Mobile via Jupiter DCA and burned, 2025-10-21 to 2026-01-01.',
    'Data Credits Burned': 'Data Credits burned for network usage at the $0.00001 peg, from 2026-06-04 17:00 UTC.',
  },
  Revenue: {
    'HNT Buyback': 'Open-market HNT bought via Jupiter DCA and burned, 2025-10-21 to 2026-01-01.',
    'HNT Burned For Data Credits': 'HNT burned to mint the Data Credits spent on network usage, from 2026-06-04 17:00 UTC.',
  },
  HoldersRevenue: {
    'HNT Buyback': 'Open-market HNT bought via Jupiter DCA and burned, reducing supply, 2025-10-21 to 2026-01-01.',
    'HNT Burned For Data Credits': 'HNT burned to mint the Data Credits spent on network usage, reducing supply, from 2026-06-04 17:00 UTC.',
  },
};

const adapters: SimpleAdapter = {
  // v1: Allium lags 10-40 min, so hourly slices would fail the indexed check nearly every run
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  start: '2025-10-21',
  isExpensiveAdapter: true,
};

export default adapters;
