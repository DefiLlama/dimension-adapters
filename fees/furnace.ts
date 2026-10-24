import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryDuneSql } from "../helpers/dune";

// Furnace (https://furnace.cash): a pump.fun launchpad where each coin's pump.fun creator fees are locked to the coin
// itself. pump.fun fee sharing sends 100% of a coin's creator fees to a vault PDA of the furnace_vault program, and
// the permissionless `sweep` instruction splits every new SOL in the vault by the coin's split, fixed on-chain at
// launch: coin holders, the coin's own buyback & burn, the coin creator (vested), $FURN buyback & burn (10%) and the
// Furnace treasury (10%, of which 30% goes to the coin's referrer when it has one).
//
// Program: https://solscan.io/account/AWpSMpZWH1C4PABpnhS6gh7c3VMs9XDzTAoDJkauFURN
const PROGRAM = "AWpSMpZWH1C4PABpnhS6gh7c3VMs9XDzTAoDJkauFURN";
// $FURN, the protocol token: https://solscan.io/token/Dg1YyVnCJtBZN8Fy1mSbUrQmKCJ7SZPApdr3XtWMpump
// Its own vault holds the half of $FURN's creator fees that is not the founder's, and its split sends all of it to
// $FURN buyback & burn (example sweep: 49ij951nG87azvbBkmdxxkvotGmou28AJYZTcXu5btzEqKySoW3pnRtUsp4uNKTiAuCJjX4Ra6ZEvMfKFCzE1S6v).
const FURN = "Dg1YyVnCJtBZN8Fy1mSbUrQmKCJ7SZPApdr3XtWMpump";

// Every sweep emits the Anchor event
//   Swept { mint: Pubkey, amount: u64, holders: u64, burn: u64, dev: u64, furn: u64, protocol: u64 }
// discriminator sha256("event:Swept")[0..8] = 0xfe8a09c6c03da587. `amount` is everything the
// sweep split; `protocol` is the treasury part after the referrer's cut, so referral = amount - all the other parts.
// Byte offsets below are Dune's 1-based offsets into the payload, the 8-byte discriminator included.
const SWEPT_DISCRIMINATOR = "0xfe8a09c6c03da587";
// the first 10 base64 characters hold the first 60 bits of the discriminator (the 11th already mixes in the mint):
// a cheap string pre-filter, the full 8 bytes are compared after decoding
const SWEPT_B64_PREFIX = "/ooJxsA9pY";
const u64At = (offset: number) => `varbinary_to_uint256(reverse(varbinary_substring(p, ${offset}, 8)))`;

const LABELS = {
  CREATOR_FEES: "Creator Fees",
  TO_HOLDERS: "Creator Fees To Coin Holders",
  TO_COIN_BURN: "Creator Fees To Coin Buyback And Burn",
  TO_CREATORS: "Creator Fees To Coin Creators",
  TO_REFERRERS: "Creator Fees To Referrers",
  TO_TREASURY: "Creator Fees To Treasury",
  TO_FURN_BURN: "Creator Fees To FURN Buyback And Burn",
  FURN_BUY_BACK: "FURN Buyback And Burn",
};

const fetch = async (options: FetchOptions) => {
  // instruction_calls is partitioned by block_date and clustered by executing_account_prefix: both bounds prune the scan
  const query = `
    WITH swept AS (
      SELECT DISTINCT i.tx_id, from_base64(substr(log_message, 15)) AS p
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.tx_success = TRUE
        AND i.executing_account = '${PROGRAM}'
        AND i.executing_account_prefix = '${PROGRAM.slice(0, 2)}'
        AND i.block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
        AND i.block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
        AND TIME_RANGE
        AND starts_with(log_message, 'Program data: ${SWEPT_B64_PREFIX}')
    ),
    parts AS (
      SELECT
        to_base58(varbinary_substring(p, 9, 32)) AS mint,
        ${u64At(41)} AS amount, ${u64At(49)} AS holders, ${u64At(57)} AS burn,
        ${u64At(65)} AS dev, ${u64At(73)} AS furn, ${u64At(81)} AS protocol
      FROM swept
      WHERE varbinary_substring(p, 1, 8) = ${SWEPT_DISCRIMINATOR}
    )
    SELECT
      COUNT(*) AS sweeps,
      COALESCE(SUM(amount), 0) AS amount,
      COALESCE(SUM(holders), 0) AS holders,
      COALESCE(SUM(CASE WHEN mint <> '${FURN}' THEN burn ELSE 0 END), 0) AS coin_burn,
      COALESCE(SUM(CASE WHEN mint = '${FURN}' THEN burn ELSE 0 END), 0) AS furn_own_burn,
      COALESCE(SUM(dev), 0) AS dev,
      COALESCE(SUM(furn), 0) AS furn,
      COALESCE(SUM(protocol), 0) AS protocol,
      COALESCE(SUM(amount - holders - burn - dev - furn - protocol), 0) AS referral
    FROM parts
  `;

  const [row] = await queryDuneSql(options, query);
  if (!row) throw new Error(`Furnace: no result for ${options.dateString}`);
  // A day without a sweep is a real zero: sweeps run only after a coin's vault collects at least 0.02 SOL of fees.

  const SOL = ADDRESSES.solana.SOL;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.add(SOL, row.amount, LABELS.CREATOR_FEES);

  dailySupplySideRevenue.add(SOL, row.holders, LABELS.TO_HOLDERS);
  dailySupplySideRevenue.add(SOL, row.coin_burn, LABELS.TO_COIN_BURN);
  dailySupplySideRevenue.add(SOL, row.dev, LABELS.TO_CREATORS);
  dailySupplySideRevenue.add(SOL, row.referral, LABELS.TO_REFERRERS);

  dailyRevenue.add(SOL, row.protocol, LABELS.TO_TREASURY);
  dailyRevenue.add(SOL, row.furn, LABELS.TO_FURN_BURN);
  dailyRevenue.add(SOL, row.furn_own_burn, LABELS.TO_FURN_BURN);

  dailyProtocolRevenue.add(SOL, row.protocol, LABELS.TO_TREASURY);

  // every coin's $FURN share and $FURN's own vault buy $FURN on its pump.fun curve / PumpSwap pool and burn it
  dailyHoldersRevenue.add(SOL, row.furn, LABELS.FURN_BUY_BACK);
  dailyHoldersRevenue.add(SOL, row.furn_own_burn, LABELS.FURN_BUY_BACK);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "pump.fun creator fees of coins launched through Furnace, paid by traders and split on-chain by the Furnace program. Excludes the founder's half of $FURN's own creator fees and coins whose fees go to a person through pump.fun fee sharing directly, since neither passes through a Furnace coin vault.",
  UserFees: "pump.fun creator fees paid by traders of coins launched through Furnace, split on-chain by the Furnace program.",
  Revenue: "The Furnace treasury share and the $FURN buyback & burn share of the creator fees of coins launched through Furnace, plus the part of $FURN's own creator fees held by its vault, all of which buys back and burns $FURN.",
  ProtocolRevenue: "The 10% Furnace treasury share of each coin's creator fees, after the 30% of it paid to the coin's referrer when it has one.",
  HoldersRevenue: "Creator fees spent on buying back and burning $FURN: 10% of every coin's creator fees, plus the part of $FURN's own creator fees held by its vault.",
  SupplySideRevenue: "Creator fees paid to the holders of each launched coin, spent on buying back and burning that coin, vested to its creator, or paid to its referrer.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CREATOR_FEES]: "pump.fun creator fees that arrive in a coin's Furnace vault and are split by the sweep instruction (Swept event amount).",
  },
  UserFees: {
    [LABELS.CREATOR_FEES]: "pump.fun creator fees that arrive in a coin's Furnace vault and are split by the sweep instruction (Swept event amount).",
  },
  Revenue: {
    [LABELS.TO_TREASURY]: "Furnace treasury share of each coin's creator fees, after the referrer's cut.",
    [LABELS.TO_FURN_BURN]: "Creator fees routed to $FURN buyback & burn: 10% of every coin's fees plus $FURN's own vault share.",
  },
  ProtocolRevenue: {
    [LABELS.TO_TREASURY]: "Furnace treasury share of each coin's creator fees, after the referrer's cut.",
  },
  HoldersRevenue: {
    [LABELS.FURN_BUY_BACK]: "Creator fees that buy $FURN on its pump.fun curve or PumpSwap pool and burn it.",
  },
  SupplySideRevenue: {
    [LABELS.TO_HOLDERS]: "Share of each coin's creator fees paid to that coin's holders (or to the single recipient of a fees-to-a-person coin).",
    [LABELS.TO_COIN_BURN]: "Share of each coin's creator fees spent on buying back and burning that same coin.",
    [LABELS.TO_CREATORS]: "Share of each coin's creator fees vested to its creator.",
    [LABELS.TO_REFERRERS]: "30% of the Furnace treasury share, paid to the referrer of a coin that has one.",
  },
};

const adapter: SimpleAdapter = {
  version: 1, // Dune query, runs once per day
  fetch,
  chains: [CHAIN.SOLANA],
  // first Swept event of the mainnet program
  start: "2026-10-20",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // these creator fees are also counted as creator fees in the pump.fun / PumpSwap fee listings
  methodology,
  breakdownMethodology,
};

export default adapter;
