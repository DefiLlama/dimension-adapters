import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Douro Labs is the official Pyth Pro data distributor
// Revenue split: Douro Labs keeps 40%, Pyth DAO receives 60%
// PYTH payments go to the Pyth DAO treasury in both periods.
// Before PIP-136, USDC payments also went to the Pyth DAO treasury.
// From PIP-136, USDC payments go to the Pythian Council Ops Multisig
// (GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2), which buys PYTH for the DAO.
// The DAO's USDC share is converted into PYTH for the DAO treasury (Strategic Reserve v1 from Dec 2025, v2 from PIP-136),
// so it counts as holders revenue; PYTH payments are held by the DAO and stay protocol revenue.
// https://forum.pyth.network/t/passed-op-pip-87-pyth-token-phase-2-pyth-strategic-reserve/2293
// https://forum.pyth.network/t/passed-op-pip-136-pyth-strategic-reserve-v2/2711
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
const PYTHIAN_COUNCIL_WALLET = "GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2";

// PIP-136: USDC DAO share is delivered to the Pythian Council instead of the DAO treasury
const PIP_136 = "2026-09-25";

// The September 2026 distribution (553,693 USDC) was sent to the DAO on 2026-10-05 instead of the
// Council: Douro "should be sending it directly to the Pythian Council wallet ... but failed to do so this time".
// Admit only this transfer; other post-PIP-136 USDC transfers to the DAO stay excluded.
// Source: https://forum.pyth.network/t/pyth-pro-douro-labs-report-september-2026/2720
const MISROUTED_USDC_TX = "4HmpUVkLMCTBZVoY2kmQaDpFkFTUUTpJ4bhrPwQeXTEKcdkmnXb8fhUv5Ha8kspL9xhvYaJYVjLE5DRcZSXNq6eZ";

// Token mints
const USDC_MINT = ADDRESSES.solana.USDC;
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const DAO_SHARE_PERCENT = 60n;
const TOTAL_PERCENT = 100n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Before PIP-136 both tokens settle at the DAO. From PIP-136, USDC settles at the Council.
  const usdcRecipient = options.dateString >= PIP_136
    ? PYTHIAN_COUNCIL_WALLET
    : PYTH_DAO_WALLET;

  // Note: Douro distributes in month N+1 for revenue earned in month N,
  // so DefiLlama data lags ~1 month vs actual earning period
  const subscriptionQuery = `
    SELECT
      mint as token_mint_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_address = '${DOURO_LABS_WALLET}'
      AND (
        (mint = '${USDC_MINT}' AND to_address = '${usdcRecipient}')
        OR (mint = '${USDC_MINT}' AND to_address = '${PYTH_DAO_WALLET}' AND txn_id = '${MISROUTED_USDC_TX}')
        OR (mint = '${PYTH_MINT}' AND to_address = '${PYTH_DAO_WALLET}')
      )
    GROUP BY mint
  `;

  const subscriptionRes = await queryAllium(subscriptionQuery);

  for (const row of subscriptionRes) {
    const daoAmount = BigInt(row.total_amount || 0);
    if (daoAmount === 0n) continue;

    // DAO receives 60%, so gross = daoAmount * 100 / 60
    const grossAmount = (daoAmount * TOTAL_PERCENT) / DAO_SHARE_PERCENT;
    const douroAmount = grossAmount - daoAmount;

    dailyFees.add(row.token_mint_address, grossAmount, "Subscription Fees");
    dailySupplySideRevenue.add(row.token_mint_address, douroAmount, "Subscription Fees to Douro Labs");

    if (row.token_mint_address === USDC_MINT) {
      dailyRevenue.add(row.token_mint_address, daoAmount, "Subscription Fees to PYTH Buybacks");
      dailyHoldersRevenue.add(row.token_mint_address, daoAmount, "Subscription Fees to PYTH Buybacks");
    } else {
      dailyRevenue.add(row.token_mint_address, daoAmount, "Subscription Fees to Pyth DAO");
      dailyProtocolRevenue.add(row.token_mint_address, daoAmount, "Subscription Fees to Pyth DAO");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total Pyth Pro subscription revenue (100% gross) paid by data subscribers, calculated from Douro Labs' on-chain distributions.",
  Revenue: "Pyth DAO's 60% share of Pyth Pro subscription revenue, paid in USDC or PYTH.",
  ProtocolRevenue: "Pyth DAO's 60% share of Pyth Pro subscription revenue when paid in PYTH, held by the DAO treasury.",
  HoldersRevenue: "Pyth DAO's 60% share of Pyth Pro subscription revenue when paid in USDC, converted into PYTH buybacks for the DAO treasury by the Pythian Council (Pyth Strategic Reserve).",
  SupplySideRevenue: "Douro Labs' 40% share of Pyth Pro subscription revenue as the official data distributor.",
}

const breakdownMethodology = {
  Fees: {
    "Subscription Fees": "Total Pyth Pro subscription revenue (100% gross) paid by data subscribers, calculated from Douro Labs' on-chain distributions.",
  },
  Revenue: {
    "Subscription Fees to PYTH Buybacks": "Pyth DAO's 60% share paid in USDC, converted into PYTH buybacks for the DAO treasury by the Pythian Council.",
    "Subscription Fees to Pyth DAO": "Pyth DAO's 60% share paid in PYTH, held by the DAO treasury.",
  },
  ProtocolRevenue: {
    "Subscription Fees to Pyth DAO": "Pyth DAO's 60% share paid in PYTH, held by the DAO treasury.",
  },
  HoldersRevenue: {
    "Subscription Fees to PYTH Buybacks": "Pyth DAO's 60% share paid in USDC, converted into PYTH buybacks for the DAO treasury by the Pythian Council.",
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
