import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

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
  SPINNER_BURN: "Spinner Burn",
  MARKETPLACE_TOKEN_SALES: "Marketplace Token Sales",
} as const;

// Marketplace quote code documents 95% to seller and 5% to treasury, so seller amount should be ~19x treasury.
const MARKETPLACE_SELLER_TO_TREASURY_MIN_RATIO = 18;
const MARKETPLACE_SELLER_TO_TREASURY_MAX_RATIO = 20;
// Spinner splits the payment 50/50 between burn and treasury (verified on-chain: legs match to 1 raw unit).
const SPINNER_BURN_TO_TREASURY_MIN_RATIO = 0.95;
const SPINNER_BURN_TO_TREASURY_MAX_RATIO = 1.05;

const fetch = async (options: FetchOptions) => {
  const { mint, treasuryAta } = chainConfig[options.chain];
  /*
    Query shape:
    1. Start from KINS transfers into the confirmed treasury ATA, the narrow fee/revenue candidate set.
    2. Join only same-tx, same-source KINS companion legs: spinner burn or marketplace seller transfer.
    3. Classify by documented split ratios (spinner burn ≈ treasury, marketplace seller ≈ 19x treasury)
       and ignore unmatched treasury inflows.
    4. Fees per docs: spinner = 50% burn (holders) + 50% treasury; marketplace = 5% of sale to treasury.
  */
  const rows: {
    spinner_fees: string;
    spinner_burn: string;
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
      CAST(COALESCE(SUM(CASE WHEN burn_amount BETWEEN treasury_amount * ${SPINNER_BURN_TO_TREASURY_MIN_RATIO} AND treasury_amount * ${SPINNER_BURN_TO_TREASURY_MAX_RATIO} THEN treasury_amount ELSE 0 END), 0) AS VARCHAR) AS spinner_fees,
      CAST(COALESCE(SUM(CASE WHEN burn_amount BETWEEN treasury_amount * ${SPINNER_BURN_TO_TREASURY_MIN_RATIO} AND treasury_amount * ${SPINNER_BURN_TO_TREASURY_MAX_RATIO} THEN burn_amount ELSE 0 END), 0) AS VARCHAR) AS spinner_burn,
      CAST(COALESCE(SUM(CASE WHEN burn_amount = 0 AND seller_amount BETWEEN treasury_amount * ${MARKETPLACE_SELLER_TO_TREASURY_MIN_RATIO} AND treasury_amount * ${MARKETPLACE_SELLER_TO_TREASURY_MAX_RATIO} THEN treasury_amount ELSE 0 END), 0) AS VARCHAR) AS marketplace_fees
    FROM classified
  `);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const row = rows[0];
  dailyFees.add(mint, row.spinner_fees, LABELS.PAID_SPINNER);
  dailyFees.add(mint, row.spinner_burn, LABELS.SPINNER_BURN);
  dailyFees.add(mint, row.marketplace_fees, LABELS.MARKETPLACE_TOKEN_SALES);
  dailyProtocolRevenue.add(mint, row.spinner_fees, LABELS.PAID_SPINNER);
  dailyProtocolRevenue.add(mint, row.marketplace_fees, LABELS.MARKETPLACE_TOKEN_SALES);
  dailyHoldersRevenue.add(mint, row.spinner_burn, LABELS.SPINNER_BURN);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "$KINS paid by players: full paid-spinner payments (50% burned, 50% to treasury) plus the 5% treasury fee on marketplace gold-for-$KINS sales.",
  Revenue: "All fees accrue to the protocol side: burned $KINS plus $KINS retained by treasury.",
  HoldersRevenue: "50% of every paid spinner payment is burned, reducing $KINS supply.",
  ProtocolRevenue: "$KINS retained by treasury (50% of spins and 5% of marketplace sales).",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.PAID_SPINNER]: "Treasury half of paid spinner payments.",
    [LABELS.SPINNER_BURN]: "Burned half of paid spinner payments.",
    [LABELS.MARKETPLACE_TOKEN_SALES]: "5% treasury fee on marketplace gold-for-$KINS sales.",
  },
  Revenue: {
    [LABELS.PAID_SPINNER]: "Treasury half of paid spinner payments.",
    [LABELS.SPINNER_BURN]: "Burned half of paid spinner payments.",
    [LABELS.MARKETPLACE_TOKEN_SALES]: "5% treasury fee on marketplace gold-for-$KINS sales.",
  },
  ProtocolRevenue: {
    [LABELS.PAID_SPINNER]: "Treasury half of paid spinner payments.",
    [LABELS.MARKETPLACE_TOKEN_SALES]: "5% treasury fee on marketplace gold-for-$KINS sales.",
  },
  HoldersRevenue: {
    [LABELS.SPINNER_BURN]: "Burned half of paid spinner payments.",
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
