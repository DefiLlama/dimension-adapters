import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryDuneSql } from "../helpers/dune";

// Attention Mine (https://www.attentionmine.com): players bid SOL on 25 tiles,
// one tile is drawn every 60 seconds and its bidders split the pot.
//
// - `close_round` takes `fee_bps` of the round's deposits (10% at launch,
//   snapshotted per round) for the treasury. The rest of the pot is paid to
//   the winning tile's bidders: player-to-player flow, counted neither as fees
//   nor as supply side, same as the grid game in fees/mineloot.ts.
// - `settle_auction` splits each weekly winning ad bid 10% to the treasury and
//   90% into that tile's jackpot vault (TREASURY_FEE_BPS = 1_000, constant).
//   The bid is advertiser income to the protocol, so the whole bid is a fee
//   and the jackpot share is supply side.
//
// Amounts come from the two programs' Anchor events rather than treasury
// inflows: the treasury is the ATTN launch's Anselm TreasuryVault and also
// receives launch proceeds and pool fee claims that are not game fees. How
// the treasury is spent (buybacks, staking rewards, build budget) is decided
// off-chain, so no HoldersRevenue is exported.

// https://solscan.io/account/4CcPUa2UTfVSwrGBHqHAysxGS8xXQmJVh7M5iQrgk5DT
const GAME_PROGRAM = "4CcPUa2UTfVSwrGBHqHAysxGS8xXQmJVh7M5iQrgk5DT";
// https://solscan.io/account/8XiBS4tQhrRprFwjkqdVoLBUH28S9fEHJyFjwdYDiy5Q
const ADS_PROGRAM = "8XiBS4tQhrRprFwjkqdVoLBUH28S9fEHJyFjwdYDiy5Q";

// Anchor event discriminators, sha256("event:<Name>")[0..8].
// RoundClosed: discriminator (8), round pubkey (32), round_id u64,
// winner_square Option<u8> (tag at byte 49; None when the round had no
// deposits), total_lamports u64, fee_lamports u64 at 59, ...
const ROUND_CLOSED = "0x2df31c168446afe2";
// AuctionSettled: discriminator (8), auction pubkey (32), epoch u64, square_id
// u8, highest_bidder pubkey (32), highest_bid_lamports u64 at 82,
// advertiser_reward_lamports u64 at 90, treasury_fee_lamports u64 at 98.
const AUCTION_SETTLED = "0x3d9783aa5fcbdb93";

const ROUND_FEE = "Round Protocol Fee";
const ROUND_FEE_TO_TREASURY = "Round Protocol Fee To Treasury";
const AD_BIDS = "Ad Auction Bids";
const AD_FEE_TO_TREASURY = "Ad Auction Fee To Treasury";
const AD_BIDS_TO_JACKPOTS = "Ad Auction Bids To Tile Jackpots";

const u64At = (offset: number) =>
  `varbinary_to_uint256(reverse(varbinary_substring(payload, ${offset}, 8)))`;

const fetch = async (options: FetchOptions) => {
  // try(): Trino may run the decode before the discriminator filter, and not
  // every "Program data:" line is base64.
  const query = `
    WITH events AS (
      SELECT DISTINCT
        i.tx_id,
        try(from_base64(substr(log_message, 15))) AS payload
      FROM solana.instruction_calls i
      CROSS JOIN UNNEST(i.log_messages) AS logs(log_message)
      WHERE i.tx_success
        AND i.executing_account IN ('${GAME_PROGRAM}', '${ADS_PROGRAM}')
        AND TIME_RANGE
        AND starts_with(log_message, 'Program data: ')
    ),
    rounds AS (
      SELECT varbinary_substring(payload, 49, 1) = 0x01 AS funded, payload
      FROM events
      WHERE varbinary_substring(payload, 1, 8) = ${ROUND_CLOSED}
    ),
    auctions AS (
      SELECT payload
      FROM events
      WHERE varbinary_substring(payload, 1, 8) = ${AUCTION_SETTLED}
    )
    SELECT
      (SELECT COUNT(*) FROM rounds) AS round_count,
      (SELECT COALESCE(SUM(${u64At(59)}), 0) FROM rounds WHERE funded) AS round_fee_lamports,
      (SELECT COALESCE(SUM(${u64At(82)}), 0) FROM auctions) AS ad_bid_lamports,
      (SELECT COALESCE(SUM(${u64At(90)}), 0) FROM auctions) AS ad_jackpot_lamports,
      (SELECT COALESCE(SUM(${u64At(98)}), 0) FROM auctions) AS ad_fee_lamports
  `;

  const [row] = await queryDuneSql(options, query);
  // Rounds close every minute, so a day with no RoundClosed event is not
  // indexed yet; a day whose rounds all drew empty is a real zero.
  if (!row || Number(row.round_count) === 0) {
    throw new Error(`Attention Mine: no RoundClosed events indexed for ${options.dateString}`);
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(ADDRESSES.solana.SOL, row.round_fee_lamports, ROUND_FEE);
  dailyRevenue.add(ADDRESSES.solana.SOL, row.round_fee_lamports, ROUND_FEE_TO_TREASURY);

  dailyFees.add(ADDRESSES.solana.SOL, row.ad_bid_lamports, AD_BIDS);
  dailyRevenue.add(ADDRESSES.solana.SOL, row.ad_fee_lamports, AD_FEE_TO_TREASURY);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, row.ad_jackpot_lamports, AD_BIDS_TO_JACKPOTS);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The protocol fee taken from every round's tile deposits (10% at launch, read per round from the RoundClosed event) plus the full winning bid of every weekly tile ad auction. Player deposits are paid out to winning bidders and are not counted.",
  UserFees: "Same as Fees, paid by tile bidders and advertisers.",
  Revenue: "The round protocol fee plus 10% of each winning ad bid, both sent to the protocol treasury.",
  ProtocolRevenue: "All revenue stays in the protocol treasury; its use (buybacks, staking rewards, build budget) is decided off-chain and not tracked here.",
  SupplySideRevenue: "The 90% of each winning ad bid forwarded into that tile's jackpot vault, paid to the tile's bidders on a jackpot hit.",
};

const breakdownMethodology = {
  Fees: {
    [ROUND_FEE]: "Protocol fee taken from each round's tile deposits at close (10% at launch, snapshotted per round).",
    [AD_BIDS]: "Winning bid of each weekly tile ad auction at settlement.",
  },
  Revenue: {
    [ROUND_FEE_TO_TREASURY]: "Round protocol fee sent to the protocol treasury.",
    [AD_FEE_TO_TREASURY]: "10% of each winning ad bid sent to the protocol treasury.",
  },
  ProtocolRevenue: {
    [ROUND_FEE_TO_TREASURY]: "Round protocol fee sent to the protocol treasury.",
    [AD_FEE_TO_TREASURY]: "10% of each winning ad bid sent to the protocol treasury.",
  },
  SupplySideRevenue: {
    [AD_BIDS_TO_JACKPOTS]: "90% of each winning ad bid forwarded into that tile's jackpot vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-08",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
