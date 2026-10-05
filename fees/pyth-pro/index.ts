import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Douro Labs is the official Pyth Pro data distributor
// Revenue split: Douro Labs keeps 40%, Pyth DAO receives 60%.
// PYTH payments go to the Pyth DAO treasury in both periods.
// Before PIP-136, USDC payments also went to the Pyth DAO treasury.
// From PIP-136, USDC payments go to the Pythian Council Ops Multisig
// (GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2), which buys PYTH for the DAO.
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
const PYTHIAN_COUNCIL_WALLET = "GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2";

// PIP-136: USDC DAO share is delivered to the Pythian Council instead of the DAO treasury.
const PIP_136 = "2026-09-25";

// Temporary compatibility window for the first post-PIP-136 payout, which was sent
// to the DAO treasury by mistake. The DAO recipient is not accepted after this date.
const USDC_DAO_EXCEPTION_LAST_DATE = "2026-10-15";

// Token mints
const USDC_MINT = ADDRESSES.solana.USDC;
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const DAO_SHARE_PERCENT = 60n;
const TOTAL_PERCENT = 100n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Before PIP-136 both tokens settle at the DAO. From PIP-136, USDC settles at the Council.
  const usdcRecipient = options.dateString >= PIP_136
    ? PYTHIAN_COUNCIL_WALLET
    : PYTH_DAO_WALLET;

  const allowLegacyUsdcRecipient =
    options.dateString >= PIP_136 &&
    options.dateString <= USDC_DAO_EXCEPTION_LAST_DATE;

  const usdcRecipientPredicate = allowLegacyUsdcRecipient
    ? `to_address IN ('${PYTHIAN_COUNCIL_WALLET}', '${PYTH_DAO_WALLET}')`
    : `to_address = '${usdcRecipient}'`;

  // Note: Douro distributes in month N+1 for revenue earned in month N,
  // so DefiLlama data lags ~1 month vs actual earning period.
  const subscriptionQuery = `
    SELECT
      mint as token_mint_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_address = '${DOURO_LABS_WALLET}'
      AND (
        (mint = '${USDC_MINT}' AND ${usdcRecipientPredicate})
        OR (mint = '${PYTH_MINT}' AND to_address = '${PYTH_DAO_WALLET}')
      )
    GROUP BY mint
  `;

  const subscriptionRes = await queryAllium(subscriptionQuery);

  for (const row of subscriptionRes) {
    const daoAmount = BigInt(row.total_amount || 0);
    if (daoAmount === 0n) continue;

    // DAO receives 60%, so gross = daoAmount * 100 / 60.
    const grossAmount = (daoAmount * TOTAL_PERCENT) / DAO_SHARE_PERCENT;
    const douroAmount = grossAmount - daoAmount;

    dailyFees.add(row.token_mint_address, grossAmount, "Subscription Fees");
    dailyRevenue.add(row.token_mint_address, daoAmount, "Subscription Fees to Pyth DAO");
    dailySupplySideRevenue.add(row.token_mint_address, douroAmount, "Subscription Fees to Douro Labs");
  }

  // Count PYTH only when it reaches the official DAO treasury. This covers
  // direct PYTH distributions from Douro and PYTH returned by the Council
  // after purchases made with Pyth Pro USDC revenue.
  const holdersRevenueQuery = `
    SELECT
      mint as token_mint_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint = '${PYTH_MINT}'
      AND to_address = '${PYTH_DAO_WALLET}'
      AND from_address IN ('${DOURO_LABS_WALLET}', '${PYTHIAN_COUNCIL_WALLET}')
    GROUP BY mint
  `;

  const holdersRevenueRes = await queryAllium(holdersRevenueQuery);

  for (const row of holdersRevenueRes) {
    const amount = BigInt(row.total_amount || 0);
    if (amount === 0n) continue;

    dailyHoldersRevenue.add(
      row.token_mint_address,
      amount,
      "PYTH Tokenholder Revenue",
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total Pyth Pro subscription revenue (100% gross), calculated from on-chain distributions.",
  Revenue: "Pyth DAO's 60% share of Pyth Pro subscription revenue.",
  HoldersRevenue: "PYTH received by the Pyth DAO treasury from Douro Labs or the Pythian Council Ops wallet. PYTH is recognized when it reaches the DAO treasury.",
  SupplySideRevenue: "Douro Labs' 40% share as the official data distributor.",
}

const breakdownMethodology = {
  Fees: {
    "Subscription Fees": "Total Pyth Pro subscription revenue (100% gross), calculated from on-chain distributions.",
  },
  Revenue: {
    "Subscription Fees to Pyth DAO": "Pyth DAO's 60% share of Pyth Pro subscription revenue.",
  },
  HoldersRevenue: {
    "PYTH Tokenholder Revenue": "PYTH received by the Pyth DAO treasury from Douro Labs or the Pythian Council Ops wallet.",
  },
  SupplySideRevenue: {
    "Subscription Fees to Douro Labs": "Douro Labs' 40% share as the official data distributor.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
