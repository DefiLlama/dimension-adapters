import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getJupiterStatsRevenue } from "../../helpers/jupiter-stats";

// Jupiter's stats API (subproduct "offerbook") from 2026-06-03, the onchain query below before that. The API counts interest
// as it accrues. The onchain query stops working on 2026-08-06: Dune has decoded no LoanCreated/LoanRepaid/LoanDefaulted
// events since that program upgrade, so it would miss interest and the fee stage.
// Program offerbkFMvVfpQhL8ZQ5iromnjct5rz3r52B9ewu3ie; fee wallet Edt83Aw3RAELsorwJkt4DDkczrTpHsNeFGzty83TQzuy.
const STATS_API_START_TS = 1780444800 // 2026-06-03
// Half of Jupiter's revenue goes to the treasury, the other half buys back JUP (counted on the Jupiter Aggregator listing).
const TREASURY_SHARE = 0.5;

const LABELS = {
  fees: "Offerbook Interest And Fees",
  revenue: "Offerbook Interest And Fees To Jupiter",
  supplySide: "Offerbook Interest And Fees To Lenders And Referrers",
}

const fetchOnchain = async (options: FetchOptions): Promise<FetchResultV2> => {
  const start = `from_unixtime(${options.startTimestamp})`;
  const end = `from_unixtime(${options.endTimestamp})`;

  const sql = `
    WITH protocol_fee AS (
      SELECT evt_tx_id, mint, CAST(amount AS double) AS amount, CAST(net_amount AS double) AS net_amount
      FROM jupiter_solana.offerbook_evt_protocolfee
      WHERE evt_block_time >= ${start} AND evt_block_time < ${end}
    ),
    -- Each ProtocolFee shares a transaction with exactly one loan-lifecycle event,
    -- which is what tells us the fee stage it was charged at.
    created_tx   AS (SELECT DISTINCT evt_tx_id FROM jupiter_solana.offerbook_evt_loancreated   WHERE evt_block_time >= ${start} AND evt_block_time < ${end}),
    repaid_tx    AS (SELECT DISTINCT evt_tx_id FROM jupiter_solana.offerbook_evt_loanrepaid    WHERE evt_block_time >= ${start} AND evt_block_time < ${end}),
    defaulted_tx AS (SELECT DISTINCT evt_tx_id FROM jupiter_solana.offerbook_evt_loandefaulted WHERE evt_block_time >= ${start} AND evt_block_time < ${end})

    -- Protocol fees, split by the stage they were charged at.
    SELECT
        CASE WHEN c.evt_tx_id IS NOT NULL THEN 'origination'
             WHEN r.evt_tx_id IS NOT NULL THEN 'repayment'
             WHEN d.evt_tx_id IS NOT NULL THEN 'collateral_claim' END AS kind
      , pf.mint
      , SUM(pf.net_amount) AS net
    FROM protocol_fee pf
    LEFT JOIN created_tx   c ON pf.evt_tx_id = c.evt_tx_id
    LEFT JOIN repaid_tx    r ON pf.evt_tx_id = r.evt_tx_id
    LEFT JOIN defaulted_tx d ON pf.evt_tx_id = d.evt_tx_id
    GROUP BY 1, 2

    UNION ALL

    SELECT
        'interest' AS kind
      , regexp_extract(json_extract_scalar(loan, '$.LoanEventV0.principal.EventAsset.Token.0.EventTokenAsset.mint'), 'PublicKey\\(([^)]+)\\)', 1) AS mint
      , SUM(CAST(json_extract_scalar(loan, '$.LoanEventV0.interest') AS double)) AS net
    FROM jupiter_solana.offerbook_evt_loanrepaid
    WHERE evt_block_time >= ${start} AND evt_block_time < ${end}
      AND loan IS NOT NULL
    GROUP BY 2
  `;

  const rows: any[] = await queryDuneSql(options, sql);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();


  for (const row of rows) {
    if (!row.mint) continue;
    if (row.kind === 'interest') {
      dailyFees.add(row.mint, row.net, LABELS.fees);
      dailySupplySideRevenue.add(row.mint, row.net, LABELS.supplySide);
    } else if (row.kind === 'repayment') {
      // the repayment fee is taken out of the lender's interest
      dailyRevenue.add(row.mint, row.net, LABELS.revenue);
      dailySupplySideRevenue.subtractToken(row.mint, row.net, LABELS.supplySide);
    } else {
      dailyFees.add(row.mint, row.net, LABELS.fees);
      dailyRevenue.add(row.mint, row.net, LABELS.revenue);
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(TREASURY_SHARE), dailySupplySideRevenue };
};

const fetchStatsApi = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getJupiterStatsRevenue(options, { offerbook: LABELS });
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(TREASURY_SHARE), dailySupplySideRevenue };
};

const fetch = async (options: FetchOptions) =>
  options.startOfDay >= STATS_API_START_TS ? fetchStatsApi(options) : fetchOnchain(options);

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-04-24',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  allowNegativeValue: true, // a loss on a loan funded by Jupiter is booked on the day it is realized
  methodology: {
    Fees: "Borrow interest paid by borrowers as it accrues, plus loan origination, repayment and collateral claim fees.",
    Revenue: "Jupiter's protocol fees, and interest on loans Jupiter funds, less losses on those loans.",
    ProtocolRevenue: "Half of Jupiter's revenue, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
    SupplySideRevenue: "Borrow interest paid to lenders, and fee rebates to referrers.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.fees]: "Borrow interest as it accrues, and loan origination, repayment and collateral claim fees.",
    },
    Revenue: {
      [LABELS.revenue]: "Jupiter's protocol fees, and interest on loans Jupiter funds, less losses on those loans.",
    },
    ProtocolRevenue: {
      [LABELS.revenue]: "Half of Jupiter's revenue, kept by the treasury.",
    },
    SupplySideRevenue: {
      [LABELS.supplySide]: "Borrow interest paid to lenders, and fee rebates to referrers.",
    },
  },
};

export default adapter;
