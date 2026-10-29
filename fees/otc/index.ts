// OTC (otcdesks.cash): a Solana launchpad. Each launcher coin's Pump.fun / PumpSwap / Meteora creator fees
// are routed to OTC fee wallets. The fee wallet claims them and splits them, almost always in the claim transaction:
// coin holders (paid in the reward token the coin chose), the Desk pot, $OTC buyback-and-burn, and the protocol.
// Docs: https://otcdesks.cash/docs   Public stats: https://otcdesks.cash/api/revenue
//
// We measure every leg on-chain in one Allium query over solana.assets.transfers, so there is no
// hard-coded split percentage (the split changed several times since launch, see PR notes).
import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryAllium } from "../../helpers/allium";
import ADDRESSES from "../../helpers/coreAssets.json";

const SOL = ADDRESSES.solana.SOL; // native SOL and WSOL are both keyed as So111...112 in Allium

// Wallets that receive launcher-coin creator fees
const LAUNCHER_FEE_WALLET = "2k5hrzuykwyTbUe8L7UriYAQhr5hijNLgBvEB4B9pP5y"; // Pump.fun + PumpSwap creator for every launcher coin
// Known gap: Meteora DBC launches have their fees claimed in the pool's quote token ($OTC or tokenized stocks),
// not SOL, by 4wYGg1KxUroz6Aitgmca64c5wqZW5q1cULCTRJ8dxhyL. They are small and not tracked here yet.
const FEE_WALLETS = [LAUNCHER_FEE_WALLET];
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Split destinations
const PROTOCOL = "FSjVufNSHPxeSo2XCVUGYv7kfGeeBQ8g1YFWpkPuJdq6";
const BUYBACK = "5JVyW4kxLAFvPwp8rxc2BiGpJztbkDyFbZBTKEnKCvee"; // swaps SOL -> $OTC on Jupiter and burns it
const DESK_POT = "BZcvtxDy4WihU24k3pezzajuiqYtTUHPfH7b5m26BucR"; // sol_pot PDA of OTC program AjMx5My4...; paid out to Desk NFT owners
// The docs' wallet table lists KLR44uzd... as the Desk pot, but it has no on-chain activity yet (Oct 28 2026); the
// program config and every desk mint still pay BZcv. Included so a future migration is tracked automatically.
const DESK_POT_NEXT = "KLR44uzdKQoev7k8YWrS3EX6KetD4Lp6cVmxy7qUnJu";
const DESK_POTS = [DESK_POT, DESK_POT_NEXT];
const OTC_DIVIDENDS = "94v857jGb4z4nWEKqGizrNM9gD68n2Wnfot6dbbtLVnk"; // 5% SOL dividends to $OTC holders, Sep 12 - Oct 2 2026

// $OTC's own creator fees: coin_creator of the $OTC PumpSwap pool (DA4pM4xS...) is OTC's program PDA below.
// The payout bot (DqMA) claims them: Pump.fun's DistributeCreatorFees pays the full amount from the $OTC creator vault
// (ATpLEC2r...) into DESK_POT, and program AjMx5My4... forwards the protocol's share to PROTOCOL in the same tx
// (e.g. 223RdWkSZacDm3N6agFCfngCmSKZrR7Z5mqc5hpLHSSiQvKehTYRDMZrYA9KURf6ej31jJ2VsZ41xDCWiRHjUVHV).
const OTC_COIN_CREATOR = "6SJHhnhrmRUGn7tLPW8n23XmoHASRzvo9xeYk7UQYL6L";
const PAYOUT_BOT = "DqMAVQ1RcQath18PrSLBVZHjwWXXN8cFEua2XuQ2rbQh"; // also the config's protocol_wallet for desk mints

// Desk NFT mints (program AjMx5My4... `mint`): the minter pays a 0.5 SOL surcharge, 0.45 SOL to the Desk pot and
// 0.05 SOL to the config's protocol wallet (DqMA), in the same tx, e.g.
// 3Xv94V2xYAP9FuMPCv6onYpL5B9rJ6Q3HFPHaxdLD7GqEXKGtev48qLSEjNHQ8WaYjwk3PaRCZo8keSNKD4J3MJa (first desk, Aug 27 2026).
// Account rent (~0.006 SOL) goes to the minter's own new accounts and is refundable, so it never reaches these wallets.
// The burned $OTC deposit is not a fee. We match mints at tx level: a non-OTC wallet paying both the pot and DqMA.

// OTC-controlled wallets: SOL moving between them is not a fee
const OTC_WALLETS = [
  ...FEE_WALLETS, PROTOCOL, BUYBACK, ...DESK_POTS, OTC_DIVIDENDS, OTC_COIN_CREATOR, PAYOUT_BOT,
  "6Y6btg9cT6Mid1LccssEFqw7DcfWk48zfC2MhhdaeBv7", // treasury, funded from PROTOCOL
  "34Kq3jEpUxjr41CCE9ot6nSgdANgvqA44hLpYwuPHTB6", // team / ops wallet
];

const list = (a: string[]) => a.map((x) => `'${x}'`).join(", ");

const LABELS = {
  LAUNCHER_FEES: METRIC.CREATOR_FEES,
  OTC_TOKEN_FEES: "$OTC Token Creator Fees",
  HOLDER_REWARDS: "Launcher Coin Holder Rewards",
  DESK_POT: "Desk Pot",
  PROTOCOL: "Protocol Share",
  BUYBACK: METRIC.TOKEN_BUY_BACK,
  DIVIDENDS: "$OTC Holder Dividends",
  MINT_SURCHARGE: "Desk Mint Surcharge",
};

const fetch = async (options: FetchOptions) => {
  // One scan of the window's SOL transfers into the wallets we track; every leg below is cut from it.
  const query = `
    WITH transfers AS (
      SELECT txn_id, from_address, to_address, signer, outer_program_id, raw_amount
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND mint = '${SOL}'
        AND to_address IN (${list([...FEE_WALLETS, PROTOCOL, BUYBACK, ...DESK_POTS, OTC_DIVIDENDS, PAYOUT_BOT])})
    ),
    otc_claims AS (
      -- $OTC creator fee claims: Pump.fun pays the $OTC creator vault balance into the Desk pot
      SELECT DISTINCT txn_id FROM transfers
      WHERE to_address IN (${list(DESK_POTS)}) AND outer_program_id = '${PUMP_PROGRAM}' AND from_address NOT IN (${list(OTC_WALLETS)})
    ),
    mints AS (
      -- Desk mint surcharges: same tx, same non-OTC payer, SOL to both the pot and the mint protocol wallet (DqMA).
      -- Mints run through OTC's program, not Pump.fun, and are signed by the minter, so they never overlap with the $OTC claims.
      SELECT txn_id, from_address,
        SUM(IFF(to_address IN (${list(DESK_POTS)}), raw_amount, 0)) AS pot_amount,
        SUM(IFF(to_address = '${PAYOUT_BOT}', raw_amount, 0)) AS protocol_amount
      FROM transfers
      WHERE to_address IN (${list([...DESK_POTS, PAYOUT_BOT])})
        AND from_address NOT IN (${list(OTC_WALLETS)})
        AND signer <> '${PAYOUT_BOT}'
      GROUP BY txn_id, from_address
      HAVING pot_amount > 0 AND protocol_amount > 0
    ),
    split_txs AS (
      -- the fee wallet's split txs pay the Desk pot, buyback or dividends wallet next to PROTOCOL
      SELECT DISTINCT txn_id FROM transfers
      WHERE from_address IN (${list(FEE_WALLETS)}) AND to_address IN (${list([BUYBACK, ...DESK_POTS, OTC_DIVIDENDS])})
    ),
    launcher_legs AS (
      SELECT
        SUM(IFF(t.to_address IN (${list(FEE_WALLETS)}) AND t.outer_program_id = '${PUMP_PROGRAM}' AND t.from_address NOT IN (${list(OTC_WALLETS)}), t.raw_amount, 0)) AS launcher_fees,
        -- PROTOCOL-only transfers out of the fee wallet are manual lumps, not the protocol share (see holderRewards)
        SUM(IFF(t.from_address IN (${list(FEE_WALLETS)}) AND t.to_address = '${PROTOCOL}' AND s.txn_id IS NOT NULL, t.raw_amount, 0)) AS launcher_protocol,
        SUM(IFF(t.from_address IN (${list(FEE_WALLETS)}) AND t.to_address = '${BUYBACK}', t.raw_amount, 0)) AS launcher_buyback,
        SUM(IFF(t.from_address IN (${list(FEE_WALLETS)}) AND t.to_address IN (${list(DESK_POTS)}), t.raw_amount, 0)) AS launcher_pot,
        SUM(IFF(t.from_address IN (${list(FEE_WALLETS)}) AND t.to_address = '${OTC_DIVIDENDS}', t.raw_amount, 0)) AS launcher_dividends
      FROM transfers t LEFT JOIN split_txs s ON t.txn_id = s.txn_id
    ),
    otc_legs AS (
      -- the pot's forward to PROTOCOL is matched to the claim tx, so other pot -> protocol moves are not counted
      SELECT
        SUM(IFF(t.to_address IN (${list(DESK_POTS)}) AND t.outer_program_id = '${PUMP_PROGRAM}' AND t.from_address NOT IN (${list(OTC_WALLETS)}), t.raw_amount, 0)) AS otc_fees,
        SUM(IFF(t.from_address IN (${list(DESK_POTS)}) AND t.to_address = '${PROTOCOL}', t.raw_amount, 0)) AS otc_protocol
      FROM transfers t JOIN otc_claims c ON t.txn_id = c.txn_id
    ),
    mint_legs AS (
      SELECT SUM(pot_amount) AS mint_pot, SUM(protocol_amount) AS mint_protocol FROM mints
    ),
    checks AS (
      -- Allium already holds transfers past the window, so an empty window is not ingestion lag
      SELECT EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT * FROM launcher_legs, otc_legs, mint_legs, checks
  `;
  const [row] = await queryAllium(query);
  if (!row) throw new Error("otc: empty Allium response");
  if (!row.indexed) throw new Error(`otc: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  // a leg with no transfers in the window sums to NULL
  const leg = (name: string) => Number(row[name] ?? 0);

  const launcherFees = leg("launcher_fees");
  const launcherProtocol = leg("launcher_protocol");
  const launcherBuyback = leg("launcher_buyback");
  const launcherPot = leg("launcher_pot");
  const launcherDividends = leg("launcher_dividends");
  const otcFees = leg("otc_fees");
  const otcProtocol = leg("otc_protocol");
  const otcPot = otcFees - otcProtocol;
  const mintPot = leg("mint_pot");
  const mintProtocol = leg("mint_protocol");
  // Launcher fees not sent to a split wallet stay in the fee wallet, which spends them on the reward tokens
  // airdropped to each coin's holders (and the account rent for those transfers). The PROTOCOL-only lumps (26 round
  // transfers, 2,605 SOL from Sep 1 to Oct 28 2026, up to 600 SOL) stay here: OTC's own /api/revenue leaves them out of
  // toProtocol, which matches the split-tx protocol leg (7,174 SOL to Oct 28 2026), and they line up with the docs'
  // note that the protocol paid holders' account deposits ("6.2% of fees against a 2.5% budget").
  const holderRewards = launcherFees - launcherProtocol - launcherBuyback - launcherPot - launcherDividends;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(SOL, launcherFees, LABELS.LAUNCHER_FEES);
  dailyFees.add(SOL, otcFees, LABELS.OTC_TOKEN_FEES);
  dailyFees.add(SOL, mintPot + mintProtocol, LABELS.MINT_SURCHARGE);

  dailyProtocolRevenue.add(SOL, launcherProtocol + otcProtocol, LABELS.PROTOCOL);
  dailyProtocolRevenue.add(SOL, mintProtocol, LABELS.MINT_SURCHARGE);
  dailyHoldersRevenue.add(SOL, launcherBuyback, LABELS.BUYBACK);
  dailyHoldersRevenue.add(SOL, launcherDividends, LABELS.DIVIDENDS);
  dailyRevenue.add(dailyProtocolRevenue);
  dailyRevenue.add(dailyHoldersRevenue);

  dailySupplySideRevenue.add(SOL, holderRewards, LABELS.HOLDER_REWARDS);
  dailySupplySideRevenue.add(SOL, launcherPot + otcPot, LABELS.DESK_POT);
  dailySupplySideRevenue.add(SOL, mintPot, LABELS.MINT_SURCHARGE);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Holder rewards are what the fee wallet keeps after the split legs, so an hour holding a late split of an earlier
  // claim goes negative: 24 hours from Aug 31 to Oct 28 2026, -73 SOL in total (worst -67.5 SOL, Sep 10 05:00 UTC).
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-27",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  doublecounted: true, // launcher coin creator fees are also counted by the Pump.fun / PumpSwap listings
  methodology: {
    Fees: "Creator fees from coins launched on OTC (Pump.fun bonding curve and PumpSwap), paid out by Pump.fun to OTC's fee wallet, plus the creator fees of the $OTC token itself, plus the 0.5 SOL surcharge paid on every Desk NFT mint (refundable account rent excluded). Meteora launches, whose fees are claimed in the quote token, are not tracked yet.",
    Revenue: "Share of launcher fees, $OTC creator fees and Desk mint surcharges sent to the OTC protocol wallet, plus the launcher fees used to buy back and burn $OTC or paid as SOL dividends to $OTC holders.",
    ProtocolRevenue: "Share of launcher fees sent to the OTC protocol wallet (12.5% since Oct 3 2026, 5% from Sep 13 to Oct 2, 15% from early September to Sep 12 and less in the first days after launch), plus the part of $OTC's own creator fees the Desk pot forwards to it (50% per the docs, less in earlier months), plus 0.05 SOL of each Desk mint surcharge.",
    HoldersRevenue: "Share of launcher fees used to buy back and burn $OTC (10% since Sep 12 2026, about 5% before) and SOL dividends paid to $OTC holders (5% of launcher fees from Sep 12 to Oct 2 2026).",
    SupplySideRevenue: "Launcher fees spent on the reward tokens airdropped to each launcher coin's holders and the account rent those payouts need (67.5% of launcher fees since Oct 3 2026, 70% before), plus the Desk pot paid out to Desk NFT owners (10% of launcher fees, the $OTC creator fees left after the protocol's part, and 0.45 SOL of each Desk mint surcharge).",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.LAUNCHER_FEES]: "Pump.fun and PumpSwap creator fees of OTC launcher coins, paid out by Pump.fun to OTC's fee wallet.",
      [LABELS.OTC_TOKEN_FEES]: "Pump.fun and PumpSwap creator fees of the $OTC token, paid into the Desk pot.",
      [LABELS.MINT_SURCHARGE]: "0.5 SOL surcharge paid on each Desk NFT mint (0.45 SOL to the Desk pot, 0.05 SOL to the protocol). Refundable account rent and the burned $OTC deposit are excluded.",
    },
    Revenue: {
      [LABELS.MINT_SURCHARGE]: "0.05 SOL protocol share of each Desk NFT mint surcharge.",
      [LABELS.PROTOCOL]: "Launcher fee share and $OTC creator fee share sent to the OTC protocol wallet in the fee split transactions.",
      [LABELS.BUYBACK]: "Launcher fee share sent to the buyback wallet, which buys $OTC on Jupiter and burns it.",
      [LABELS.DIVIDENDS]: "SOL dividends to $OTC holders (Sep 12 - Oct 2 2026).",
    },
    ProtocolRevenue: {
      [LABELS.PROTOCOL]: "Launcher fee share and $OTC creator fee share sent to the OTC protocol wallet in the fee split transactions.",
      [LABELS.MINT_SURCHARGE]: "0.05 SOL protocol share of each Desk NFT mint surcharge.",
    },
    HoldersRevenue: {
      [LABELS.BUYBACK]: "Launcher fee share sent to the buyback wallet, which buys $OTC on Jupiter and burns it.",
      [LABELS.DIVIDENDS]: "SOL dividends to $OTC holders (Sep 12 - Oct 2 2026).",
    },
    SupplySideRevenue: {
      [LABELS.HOLDER_REWARDS]: "Launcher fees left in the fee wallet after the split transfers, spent on the reward token (stocks, pre-IPO, yield tokens) airdropped to each coin's holders and on the account rent those payouts need.",
      [LABELS.DESK_POT]: "Launcher fee share and the $OTC creator fees left after the protocol's part, sent to the Desk pot and paid out to Desk NFT owners.",
      [LABELS.MINT_SURCHARGE]: "0.45 SOL of each Desk NFT mint surcharge, sent to the Desk pot and paid out to Desk NFT owners.",
    },
  },
};

export default adapter;
