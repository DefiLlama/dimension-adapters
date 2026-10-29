// OTC (otcdesks.cash): a Solana launchpad. Each launcher coin's Pump.fun / PumpSwap / Meteora creator fees
// are routed to OTC fee wallets. OTC's program claims them and splits them in the same transaction:
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

// Split destinations
const PROTOCOL = "FSjVufNSHPxeSo2XCVUGYv7kfGeeBQ8g1YFWpkPuJdq6";
const BUYBACK = "5JVyW4kxLAFvPwp8rxc2BiGpJztbkDyFbZBTKEnKCvee"; // swaps SOL -> $OTC on Jupiter and burns it
const DESK_POT = "BZcvtxDy4WihU24k3pezzajuiqYtTUHPfH7b5m26BucR"; // sol_pot PDA of OTC program AjMx5My4...; paid out to Desk NFT owners
// The docs' wallet table lists KLR44uzd... as the Desk pot, but it has no on-chain activity yet (Oct 28 2026); the
// program config and every desk mint still pay BZcv. Included so a future migration is tracked automatically.
const DESK_POT_NEXT = "KLR44uzdKQoev7k8YWrS3EX6KetD4Lp6cVmxy7qUnJu";
const DESK_POTS = [DESK_POT, DESK_POT_NEXT];
const OTC_DIVIDENDS = "94v857jGb4z4nWEKqGizrNM9gD68n2Wnfot6dbbtLVnk"; // 5% SOL dividends to $OTC holders, Sep 13 - Oct 2 2026

// $OTC's own creator fees: coin_creator of the $OTC PumpSwap pool (DA4pM4xS...) is OTC's program PDA below.
// The payout bot (DqMA) claims them through program AjMx5My4...: the full amount lands in DESK_POT, which then
// forwards 50% to PROTOCOL in the same tx (e.g. 223RdWkSZacDm3N6agFCfngCmSKZrR7Z5mqc5hpLHSSiQvKehTYRDMZrYA9KURf6ej31jJ2VsZ41xDCWiRHjUVHV).
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
  // Desk mint surcharges: same tx, same non-OTC payer, SOL to both the pot and the mint protocol wallet (DqMA).
  // The signer is the minter, never PAYOUT_BOT, so these never overlap with 'otc_fees' below.
  const mintTxs = `
      SELECT txn_id, from_address,
        SUM(CASE WHEN to_address IN (${list(DESK_POTS)}) THEN raw_amount ELSE 0 END) AS pot_amount,
        SUM(CASE WHEN to_address = '${PAYOUT_BOT}' THEN raw_amount ELSE 0 END) AS protocol_amount
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND mint = '${SOL}'
        AND to_address IN (${list([...DESK_POTS, PAYOUT_BOT])})
        AND from_address NOT IN (${list(OTC_WALLETS)})
        AND signer <> '${PAYOUT_BOT}'
      GROUP BY txn_id, from_address
      HAVING SUM(CASE WHEN to_address IN (${list(DESK_POTS)}) THEN raw_amount ELSE 0 END) > 0
        AND SUM(CASE WHEN to_address = '${PAYOUT_BOT}' THEN raw_amount ELSE 0 END) > 0`;
  const query = `
    SELECT leg, SUM(raw_amount) AS amount FROM (
      SELECT raw_amount,
        CASE
          WHEN to_address IN (${list(FEE_WALLETS)}) AND from_address NOT IN (${list(OTC_WALLETS)}) THEN 'launcher_fees'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${PROTOCOL}' THEN 'launcher_protocol'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${BUYBACK}' THEN 'launcher_buyback'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address IN (${list(DESK_POTS)}) THEN 'launcher_pot'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${OTC_DIVIDENDS}' THEN 'launcher_dividends'
          WHEN signer = '${PAYOUT_BOT}' AND to_address IN (${list(DESK_POTS)}) AND from_address NOT IN (${list(OTC_WALLETS)}) THEN 'otc_fees'
          WHEN from_address IN (${list(DESK_POTS)}) AND to_address = '${PROTOCOL}' THEN 'otc_protocol'
        END AS leg
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND mint = '${SOL}'
        AND (to_address IN (${list([...FEE_WALLETS, PROTOCOL, BUYBACK, ...DESK_POTS, OTC_DIVIDENDS])}))
    ) WHERE leg IS NOT NULL
    GROUP BY leg
    UNION ALL
    SELECT 'mint_pot' AS leg, SUM(pot_amount) AS amount FROM (${mintTxs})
    UNION ALL
    SELECT 'mint_protocol' AS leg, SUM(protocol_amount) AS amount FROM (${mintTxs})
  `;
  const rows = await queryAllium(query);
  const leg = (name: string) => Number(rows.find((r: any) => r.leg === name)?.amount ?? 0);

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
  // What stays in the fee wallet is spent on the reward tokens airdropped to each coin's holders
  // (also pays account rent for those transfers). Split legs are almost always in the claim tx itself.
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
  dailyHoldersRevenue.add(SOL, launcherPot + otcPot, LABELS.DESK_POT);
  dailyHoldersRevenue.add(SOL, mintPot, LABELS.MINT_SURCHARGE);
  dailyRevenue.add(dailyProtocolRevenue);
  dailyRevenue.add(dailyHoldersRevenue);

  dailySupplySideRevenue.add(SOL, holderRewards, LABELS.HOLDER_REWARDS);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-27",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  doublecounted: true, // launcher coin creator fees are also counted by the Pump.fun / PumpSwap listings
  methodology: {
    Fees: "Creator fees from coins launched on OTC (Pump.fun bonding curve and PumpSwap), which are routed to OTC's fee wallets, plus the creator fees of the $OTC token itself, plus the 0.5 SOL surcharge paid on every Desk NFT mint (refundable account rent excluded). Meteora launches, whose fees are claimed in the quote token, are not tracked yet.",
    Revenue: "Protocol share plus holders revenue: SOL used to buy back and burn $OTC, SOL dividends paid to $OTC holders, and the Desk pot paid to Desk NFT owners (including the full 0.5 SOL Desk mint surcharge).",
    ProtocolRevenue: "Share of launcher fees sent to the OTC protocol wallet (12.5% since Oct 3 2026) plus 50% of $OTC's own creator fees, plus 0.05 SOL of each Desk mint surcharge.",
    HoldersRevenue: "Share of launcher fees used to buy back and burn $OTC (10% since Oct 3 2026), 5% paid as SOL dividends to $OTC holders from Sep 13 to Oct 2 2026, and the Desk pot paid to Desk NFT owners (10% of launcher fees, 50% of $OTC's own creator fees and 0.45 SOL of each Desk mint surcharge).",
    SupplySideRevenue: "Rewards bought for each launcher coin's holders (67.5% since Oct 3 2026).",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.LAUNCHER_FEES]: "Pump.fun and PumpSwap creator fees of OTC launcher coins, claimed into OTC's fee wallets.",
      [LABELS.OTC_TOKEN_FEES]: "PumpSwap creator fees of the $OTC token, claimed by OTC's program.",
      [LABELS.MINT_SURCHARGE]: "0.5 SOL surcharge paid on each Desk NFT mint (0.45 SOL to the Desk pot, 0.05 SOL to the protocol). Refundable account rent and the burned $OTC deposit are excluded.",
    },
    Revenue: {
      [LABELS.MINT_SURCHARGE]: "0.5 SOL Desk NFT mint surcharge (0.05 SOL protocol share plus 0.45 SOL to the Desk pot).",
      [LABELS.DESK_POT]: "Launcher fee share and 50% of $OTC creator fees sent to the Desk pot, paid out to Desk NFT owners.",
      [LABELS.PROTOCOL]: "Launcher fee share and $OTC creator fee share sent to the OTC protocol wallet.",
      [LABELS.BUYBACK]: "Launcher fee share sent to the buyback wallet, which buys $OTC on Jupiter and burns it.",
      [LABELS.DIVIDENDS]: "SOL dividends to $OTC holders (Sep 13 - Oct 2 2026).",
    },
    ProtocolRevenue: {
      [LABELS.PROTOCOL]: "Launcher fee share and $OTC creator fee share sent to the OTC protocol wallet.",
      [LABELS.MINT_SURCHARGE]: "0.05 SOL protocol share of each Desk NFT mint surcharge.",
    },
    HoldersRevenue: {
      [LABELS.BUYBACK]: "Launcher fee share sent to the buyback wallet, which buys $OTC on Jupiter and burns it.",
      [LABELS.DIVIDENDS]: "SOL dividends to $OTC holders (Sep 13 - Oct 2 2026).",
      [LABELS.DESK_POT]: "Launcher fee share and 50% of $OTC creator fees sent to the Desk pot, paid out to Desk NFT owners.",
      [LABELS.MINT_SURCHARGE]: "0.45 SOL of each Desk NFT mint surcharge, sent to the Desk pot and paid out to Desk NFT owners.",
    },
    SupplySideRevenue: {
      [LABELS.HOLDER_REWARDS]: "Launcher fees kept in the fee wallet and spent on the reward token (stocks, pre-IPO, yield tokens) airdropped to each coin's holders, including transfer rent.",
    },
  },
};

export default adapter;
