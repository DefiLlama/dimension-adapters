import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// These are all self-researched addresses as kintara dont have publicy mentioned addresses.
// KINS mint comes from kintara.gg/api/token/blimp-stats; Jupiter confirms it as Token-2022 KINS.
// Public wallet modules show spinner = 50% burn/50% treasury and marketplace = 5% treasury/95% seller.
// Treasury ATA was confirmed from Dune burn-adjacent KINS transfers: 2,234 txs on 2026-06-10..15.
// ref https://kintara.gg/#docs
const chainConfig: Record<string, { start: string; mint: string; treasuryAta: string }> = {
  [CHAIN.SOLANA]: {
    start: "2026-05-22",
    mint: "Tqj8yFmagrg7oorpQkVGYR52r96RFTamvWfth9bpump",
    treasuryAta: "FawpB6tqFaZybcQjUzHaSXFASmRRzxuFzTEsbGzxHFq4",
  },
};

const LABELS = {
  PAID_SPINNER: "Paid Spinner",
  MARKETPLACE_TOKEN_SALES: "Marketplace Token Sales",
} as const;

const fetch = async (options: FetchOptions) => {
  const { mint, treasuryAta } = chainConfig[options.chain];
  /*
    Query shape:
    1. Start from KINS transfers into the confirmed treasury ATA, the narrow fee/revenue candidate set.
    2. Join only same-tx, same-source KINS companion legs: spinner burn or marketplace seller transfer.
    3. Count volume as the full product payment and ignore unmatched treasury inflows.
    4. Fees to treasury as per docs 5% of marketplace, 50% of spinner
  */
  const rows: {
    spinner_volume: string;
    spinner_fees: string;
    marketplace_volume: string;
    marketplace_fees: string;
  }[] = await queryDuneSql(options, `
    WITH treasury_transfers AS (
      SELECT
        tx_id,
        from_token_account,
        amount AS treasury_amount
      FROM tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND token_mint_address = '${mint}'
        AND action = 'transfer'
        AND to_token_account = '${treasuryAta}'
    ),
    classified AS (
      SELECT
        t.tx_id,
        t.from_token_account,
        t.treasury_amount,
        SUM(CASE WHEN x.action = 'burn' THEN x.amount ELSE 0 END) AS burn_amount,
        SUM(CASE WHEN x.action = 'transfer' THEN x.amount ELSE 0 END) AS seller_amount
      FROM treasury_transfers t
      JOIN tokens_solana.transfers x
        ON x.tx_id = t.tx_id
        AND x.from_token_account = t.from_token_account
        AND x.token_mint_address = '${mint}'
        AND (
          x.action = 'burn'
          OR (x.action = 'transfer' AND x.to_token_account <> '${treasuryAta}')
        )
        AND TIME_RANGE
      GROUP BY 1, 2, 3
    )
    SELECT
      CAST(COALESCE(SUM(CASE WHEN burn_amount > 0 THEN treasury_amount + burn_amount ELSE 0 END), 0) AS VARCHAR) AS spinner_volume,
      CAST(COALESCE(SUM(CASE WHEN burn_amount > 0 THEN treasury_amount ELSE 0 END), 0) AS VARCHAR) AS spinner_fees,
      CAST(COALESCE(SUM(CASE WHEN burn_amount = 0 AND seller_amount BETWEEN treasury_amount * 18 AND treasury_amount * 20 THEN treasury_amount + seller_amount ELSE 0 END), 0) AS VARCHAR) AS marketplace_volume,
      CAST(COALESCE(SUM(CASE WHEN burn_amount = 0 AND seller_amount BETWEEN treasury_amount * 18 AND treasury_amount * 20 THEN treasury_amount ELSE 0 END), 0) AS VARCHAR) AS marketplace_fees
    FROM classified
  `);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const row = rows[0];
  dailyVolume.add(mint, row.spinner_volume);
  dailyVolume.add(mint, row.marketplace_volume);
  dailyFees.add(mint, row.spinner_fees, LABELS.PAID_SPINNER);
  dailyFees.add(mint, row.marketplace_fees, LABELS.MARKETPLACE_TOKEN_SALES);

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Volume: "Paid spinner game volume and marketplace volume.",
  Fees: "Includes $KINS paid to Kintara treasury.",
  Revenue: "$KINS retained by treasury.",
  ProtocolRevenue: "$KINS retained by treasury.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.PAID_SPINNER]: "Paid spinner treasury fees.",
    [LABELS.MARKETPLACE_TOKEN_SALES]: "Marketplace treasury fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
