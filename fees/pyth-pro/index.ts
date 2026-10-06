import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Douro Labs is the official Pyth Pro data distributor.
// The Pyth Pro umbrella includes Pyth Pro subscriptions, LaaS, and Indices.
// Revenue shares are product-specific: Pyth Pro and Indices use 60/40;
// LaaS uses 90/10.
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
const PYTHIAN_COUNCIL_WALLET = "GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2";

// PIP-136: USDC DAO share is delivered to the Pythian Council instead of the DAO treasury.
const PIP_136 = "2026-09-25";

// Temporary compatibility window for the first post-PIP-136 payout, which was sent
// to the DAO treasury by mistake. The DAO recipient is not accepted after this date.
const USDC_DAO_EXCEPTION_LAST_DATE = "2026-10-15";

// September 2026 mixed-product distribution. The official report allocates the
// DAO receipt across the Pyth Pro umbrella's three verticals.
// Source: https://forum.pyth.network/t/pyth-pro-douro-labs-report-september-2026/2720
const PIP_136_DAO_EXCEPTION_TX =
  "4HmpUVkLMCTBZVoY2kmQaDpFkFTUUTpJ4bhrPwQeXTEKcdkmnXb8fhUv5Ha8kspL9xhvYaJYVjLE5DRcZSXNq6eZ";

// The exception payment occurred on October 5, 2026 UTC.
const EXCEPTION_PAYMENT_START = 1791158400;
const EXCEPTION_PAYMENT_END = 1791244800;

const PIP_136_EXCEPTION_ALLOCATIONS = [
  {
    feesLabel: "Pyth Pro Subscription Fees",
    daoAmount: 460_850_000_000n,
    daoSharePercent: 60n,
  },
  {
    feesLabel: "Pyth Pro LaaS Fees",
    daoAmount: 11_430_000_000n,
    daoSharePercent: 90n,
  },
  {
    feesLabel: "Pyth Pro Indices Fees",
    daoAmount: 81_413_000_000n,
    daoSharePercent: 60n,
  },
] as const;

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

  const addDistribution = (
    token: string,
    daoAmount: bigint,
    daoSharePercent: bigint,
    feesLabel: string,
    revenueLabel: string,
    supplySideLabel: string,
    isProtocolRevenue: boolean,
  ) => {
    const grossAmount = (daoAmount * TOTAL_PERCENT) / daoSharePercent;
    const douroAmount = grossAmount - daoAmount;

    dailyFees.add(token, grossAmount, feesLabel);
    dailyRevenue.add(token, daoAmount, revenueLabel);
    dailySupplySideRevenue.add(token, douroAmount, supplySideLabel);

    if (isProtocolRevenue) {
      dailyProtocolRevenue.add(token, daoAmount, revenueLabel);
    }
  };

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
  // The mixed September transaction is excluded and allocated below by product.
  const subscriptionQuery = `
    SELECT
      mint as token_mint_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_address = '${DOURO_LABS_WALLET}'
      AND NOT (
        mint = '${USDC_MINT}'
        AND txn_id = '${PIP_136_DAO_EXCEPTION_TX}'
      )
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

    const isDirectPythDistribution = row.token_mint_address === PYTH_MINT;

    addDistribution(
      row.token_mint_address,
      daoAmount,
      DAO_SHARE_PERCENT,
      "Pyth Pro Subscription Fees",
      "Pyth Pro Subscription Fees to Pyth DAO",
      "Pyth Pro Subscription Fees to Douro Labs",
      !isDirectPythDistribution,
    );
  }

  // Process the first post-PIP-136 DAO-directed payment separately. The Solana
  // transfer is 553,693 USDC, but the official report allocates it as:
  // 460,850 Pyth Pro, 11,430 LaaS, and 81,413 Indices DAO share.
  const exceptionWindowOverlaps =
    options.startTimestamp < EXCEPTION_PAYMENT_END &&
    options.endTimestamp > EXCEPTION_PAYMENT_START;

  if (exceptionWindowOverlaps) {
    const exceptionQuery = `
      SELECT COUNT(*) as matching_transfers
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND txn_id = '${PIP_136_DAO_EXCEPTION_TX}'
        AND mint = '${USDC_MINT}'
        AND from_address = '${DOURO_LABS_WALLET}'
        AND to_address = '${PYTH_DAO_WALLET}'
    `;

    const exceptionRes = await queryAllium(exceptionQuery);
    const exceptionFound = exceptionRes.some(
      (row) => BigInt(row.matching_transfers || 0) > 0n,
    );

    if (exceptionFound) {
      for (const allocation of PIP_136_EXCEPTION_ALLOCATIONS) {
        addDistribution(
          USDC_MINT,
          allocation.daoAmount,
          allocation.daoSharePercent,
          allocation.feesLabel,
          `${allocation.feesLabel} to Pyth DAO`,
          `${allocation.feesLabel} to Douro Labs`,
          true,
        );
      }
    }
  }

  // Count PYTH when it reaches the official DAO treasury.
  // Direct Douro distributions are known Pyth Pro umbrella revenue.
  // Historical Council returns are tracked separately as unattributed DAO treasury buybacks
  // until a direct Douro -> Council funding link is available.
  //
  // Example September 2026 direct buyback:
  // swap:   https://orbmarkets.io/tx/2YzFNSJDBQDHCAQVWz43nM7kk6ntKRRuMxf8mV4tehhKGzFmq1qBd6XreXmiYXWbDLuYS4KGbSNUYGaWFtTdxQqQ
  // return: https://orbmarkets.io/tx/26q1EGem6CSRrafDCkefLPY78WJJZs99ZweXaLVpkfvM9vLaa8o2vJTuzRPyqvxfVAe34bQTs6XmzVjwsvK4ZtKS
  const holdersRevenueQuery = `
    SELECT
      mint as token_mint_address,
      from_address as source_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint = '${PYTH_MINT}'
      AND to_address = '${PYTH_DAO_WALLET}'
      AND from_address IN ('${DOURO_LABS_WALLET}', '${PYTHIAN_COUNCIL_WALLET}')
    GROUP BY mint, from_address
  `;

  const holdersRevenueRes = await queryAllium(holdersRevenueQuery);

  for (const row of holdersRevenueRes) {
    const amount = BigInt(row.total_amount || 0);
    if (amount === 0n) continue;

    const label = row.source_address === DOURO_LABS_WALLET
      ? "PYTH Direct Distribution - Pyth Pro Umbrella"
      : "PYTH Buyback - Unattributed DAO Treasury";

    dailyHoldersRevenue.add(row.token_mint_address, amount, label);
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
  Fees: "Total Pyth Pro umbrella revenue, including Pyth Pro subscriptions, LaaS, and Indices. Product-specific DAO shares and supplier shares are applied before aggregation.",
  Revenue: "The DAO share of the Pyth Pro umbrella, including Pyth Pro subscriptions, LaaS, and Indices.",
  ProtocolRevenue: "Pyth Pro umbrella DAO revenue received in USDC and held as protocol or treasury revenue before a source-linked PYTH reclassification.",
  HoldersRevenue: "PYTH directly distributed by Douro Labs or returned to the DAO treasury after Council buybacks. Historical Council returns remain separately labelled as unattributed DAO treasury buybacks until their funding source is linked.",
  SupplySideRevenue: "Douro Labs' applicable share of Pyth Pro subscriptions, LaaS, and Indices revenue.",
}

const breakdownMethodology = {
  Fees: {
    "Pyth Pro Subscription Fees": "Gross Pyth Pro subscription revenue.",
    "Pyth Pro LaaS Fees": "Gross Listing as a Service revenue included in the Pyth Pro umbrella.",
    "Pyth Pro Indices Fees": "Gross Pyth Indices revenue included in the Pyth Pro umbrella.",
  },
  Revenue: {
    "Pyth Pro Subscription Fees to Pyth DAO": "Pyth Pro subscription share received by the DAO.",
    "Pyth Pro LaaS Fees to Pyth DAO": "LaaS share received by the DAO.",
    "Pyth Pro Indices Fees to Pyth DAO": "Indices share received by the DAO.",
  },
  ProtocolRevenue: {
    "Pyth Pro Subscription Fees to Pyth DAO": "Pyth Pro subscription DAO revenue held as protocol or treasury revenue.",
    "Pyth Pro LaaS Fees to Pyth DAO": "LaaS DAO revenue held as protocol or treasury revenue.",
    "Pyth Pro Indices Fees to Pyth DAO": "Indices DAO revenue held as protocol or treasury revenue.",
  },
  HoldersRevenue: {
    "PYTH Direct Distribution - Pyth Pro Umbrella": "PYTH directly distributed by Douro Labs to the DAO treasury.",
    "PYTH Buyback - Unattributed DAO Treasury": "PYTH returned to the DAO treasury by the Council from a buyback whose original funding source is not yet linked.",
  },
  SupplySideRevenue: {
    "Pyth Pro Subscription Fees to Douro Labs": "Douro Labs' share of Pyth Pro subscription revenue.",
    "Pyth Pro LaaS Fees to Douro Labs": "Douro Labs' share of LaaS revenue.",
    "Pyth Pro Indices Fees to Douro Labs": "Douro Labs' share of Indices revenue.",
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
