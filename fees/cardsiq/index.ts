import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import ADDRESSES from "../../helpers/coreAssets.json";

// CardsIQ gives card breakers an instant cash market for what they open.
// Partners run live breaks on Whatnot, Fanatics Live and TikTok, selling spots
// in a case; CardsIQ prices every card a viewer wins and offers to buy it from
// them on the spot. Take the offer and USDC lands in your wallet in seconds;
// decline it and the card is shipped to you.
//
// An accepted offer settles in one on-chain transaction that pays the seller
// and CardsIQ's fee wallet together. That is what this adapter reads: the fee
// is the leg paid to the fee wallet, and the sale is worth what the whole
// transaction moved.

const USDC = ADDRESSES.solana.USDC;

// Fee wallets. Append on a rotation, never replace: history is recomputed, so
// removing an address zeroes out every day it was live.
const FEE_WALLETS = ["8zyBnSAbfmUTEPTsdVChxfWxjDkskiZpCMKy6u6T9p4H"];

// Operational wallet. Funds partners and holds escrow, so money leaving it is
// only a fee when the fee wallet is the sole recipient.
const TREASURY = "BGx64qJyoNx9GjuPsVLPLKqLeKW9HsXd9THEZ4Wgcv37";

// Escrow program. Settlements routed through it pay the fee out of the order's
// vault rather than from the partner's own wallet.
const ESCROW_PROGRAM = "FYeFmbxyJ9RSnUGMtq3Z3x7DQLu9CK2LZuQJZxsiC51Z";

const list = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(", ");

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const window = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const rows = await queryAllium(`
    WITH transfers AS (
      SELECT txn_id, from_address, to_address, raw_amount
      FROM solana.assets.transfers
      WHERE mint = '${USDC}' AND ${window}
    ),
    fees AS (
      SELECT txn_id, MAX(from_address) AS payer, SUM(raw_amount) AS fee
      FROM transfers
      WHERE to_address IN (${list(FEE_WALLETS)})
      GROUP BY txn_id
    ),
    -- The fee wallet paying out is CardsIQ moving its own money, not a charge.
    refunds AS (
      SELECT DISTINCT txn_id FROM transfers
      WHERE from_address IN (${list(FEE_WALLETS)})
    ),
    escrowed AS (
      SELECT DISTINCT txn_id FROM solana.raw.instructions
      WHERE program_id = '${ESCROW_PROGRAM}' AND ${window}
    ),
    totals AS (
      SELECT txn_id, SUM(raw_amount) AS total FROM transfers GROUP BY txn_id
    )
    SELECT
      CASE
        -- Nothing moved but the fee itself: a sweep of fees billed off chain.
        WHEN f.payer = '${TREASURY}' AND t.total = f.fee THEN 'SWEPT'
        WHEN e.txn_id IS NOT NULL THEN 'ESCROW'
        ELSE 'DIRECT'
      END AS leg,
      SUM(f.fee) AS fee,
      SUM(t.total) AS total
    FROM fees f
    JOIN totals t ON t.txn_id = f.txn_id
    LEFT JOIN escrowed e ON e.txn_id = f.txn_id
    LEFT JOIN refunds r ON r.txn_id = f.txn_id
    WHERE r.txn_id IS NULL
    GROUP BY 1
  `);

  for (const { leg, fee, total } of rows) {
    if (leg === "SWEPT") {
      dailyFees.add(USDC, fee, "SWEPT_FEES");
      continue;
    }
    // A settlement's gross is everything it moved: the collector's payout, the
    // fee, and anything withheld against a debt the collector owes.
    dailyFees.add(USDC, fee, leg === "ESCROW" ? "ESCROW_FEES" : "SETTLEMENT_FEES");
    dailyVolume.add(USDC, total);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: "0",
  };
};

const methodology = {
  Volume:
    "Value of the cards partners buy from the viewers who win them in a live break, measured as the total USDC each settlement transaction moves. Excludes treasury-to-partner funding, Coinflow deposits and withdrawals, and cards CardsIQ buys for its own inventory.",
  Fees:
    "USDC paid into the CardsIQ fee wallet: the fee charged on each card sale, plus partner subscriptions, on-ramp cuts, withdrawal fees and API usage fees, which are swept there from the treasury.",
  UserFees: "Fees charged on CardsIQ's services. Identical to Fees.",
  Revenue: "CardsIQ retains all fees, so Revenue equals Fees.",
  ProtocolRevenue: "Identical to Revenue.",
  HoldersRevenue: "No token.",
};

const breakdownMethodology = {
  Fees: {
    SETTLEMENT_FEES:
      "The fee charged on a card sale settled directly from the partner's wallet, paid to the fee wallet in the transaction that pays the seller.",
    ESCROW_FEES:
      "The same fee on a sale held in escrow until the partner approves it, paid out of the order's vault when the escrow is released.",
    SWEPT_FEES:
      "Fees billed off chain and later swept from the treasury in one transfer: partner subscriptions and monthly minimums, on-ramp cuts, Coinflow withdrawal fees and API usage fees. They arrive as identical transfers and cannot be separated on chain.",
  },
  Revenue: {
    SETTLEMENT_FEES: "Retained in full.",
    ESCROW_FEES: "Retained in full.",
    SWEPT_FEES: "Retained in full.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  start: '2026-07-28',
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
