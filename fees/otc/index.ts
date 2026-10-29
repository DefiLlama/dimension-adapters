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
// Meteora DBC launches (13 pools, Sep 12-23 2026) are quoted in $OTC and their fees are claimed in $OTC by
// 4wYGg1KxUroz6Aitgmca64c5wqZW5q1cULCTRJ8dxhyL. They are small and not tracked here.
const FEE_WALLETS = [LAUNCHER_FEE_WALLET];

// Split destinations
const PROTOCOL = "FSjVufNSHPxeSo2XCVUGYv7kfGeeBQ8g1YFWpkPuJdq6";
const BUYBACK = "5JVyW4kxLAFvPwp8rxc2BiGpJztbkDyFbZBTKEnKCvee"; // swaps SOL -> $OTC on Jupiter and burns it
const DESK_POT = "BZcvtxDy4WihU24k3pezzajuiqYtTUHPfH7b5m26BucR"; // pot PDA of OTC program AjMx5My4...; paid out to Desk NFT owners
const OTC_DIVIDENDS = "94v857jGb4z4nWEKqGizrNM9gD68n2Wnfot6dbbtLVnk"; // 5% SOL dividends to $OTC holders, Sep 13 - Oct 2 2026

// $OTC's own creator fees: coin_creator of the $OTC PumpSwap pool (DA4pM4xS...) is OTC's program PDA below.
// The payout bot (DqMA) claims them through program AjMx5My4...: the full amount lands in DESK_POT, which then
// forwards 50% to PROTOCOL in the same tx (e.g. 223RdWkSZacDm3N6agFCfngCmSKZrR7Z5mqc5hpLHSSiQvKehTYRDMZrYA9KURf6ej31jJ2VsZ41xDCWiRHjUVHV).
const OTC_COIN_CREATOR = "6SJHhnhrmRUGn7tLPW8n23XmoHASRzvo9xeYk7UQYL6L";
const PAYOUT_BOT = "DqMAVQ1RcQath18PrSLBVZHjwWXXN8cFEua2XuQ2rbQh";

// OTC-controlled wallets: SOL moving between them is not a fee
const OTC_WALLETS = [
  ...FEE_WALLETS, PROTOCOL, BUYBACK, DESK_POT, OTC_DIVIDENDS, OTC_COIN_CREATOR, PAYOUT_BOT,
  "KLR44uzdKQoev7k8YWrS3EX6KetD4Lp6cVmxy7qUnJu", // desk pot wallet (docs)
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
};

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT leg, SUM(raw_amount) AS amount FROM (
      SELECT raw_amount,
        CASE
          WHEN to_address IN (${list(FEE_WALLETS)}) AND from_address NOT IN (${list(OTC_WALLETS)}) THEN 'launcher_fees'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${PROTOCOL}' THEN 'launcher_protocol'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${BUYBACK}' THEN 'launcher_buyback'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${DESK_POT}' THEN 'launcher_pot'
          WHEN from_address IN (${list(FEE_WALLETS)}) AND to_address = '${OTC_DIVIDENDS}' THEN 'launcher_dividends'
          WHEN signer = '${PAYOUT_BOT}' AND to_address = '${DESK_POT}' AND from_address NOT IN (${list(OTC_WALLETS)}) THEN 'otc_fees'
          WHEN from_address = '${DESK_POT}' AND to_address = '${PROTOCOL}' THEN 'otc_protocol'
        END AS leg
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND mint = '${SOL}'
        AND (to_address IN (${list([...FEE_WALLETS, PROTOCOL, BUYBACK, DESK_POT, OTC_DIVIDENDS])}))
    ) WHERE leg IS NOT NULL
    GROUP BY leg
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

  dailyProtocolRevenue.add(SOL, launcherProtocol + otcProtocol, LABELS.PROTOCOL);
  dailyHoldersRevenue.add(SOL, launcherBuyback, LABELS.BUYBACK);
  dailyHoldersRevenue.add(SOL, launcherDividends, LABELS.DIVIDENDS);
  dailyRevenue.add(dailyProtocolRevenue);
  dailyRevenue.add(dailyHoldersRevenue);

  dailySupplySideRevenue.add(SOL, holderRewards, LABELS.HOLDER_REWARDS);
  dailySupplySideRevenue.add(SOL, launcherPot + otcPot, LABELS.DESK_POT);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-31",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  doublecounted: true, // launcher coin creator fees are also counted by the Pump.fun / PumpSwap listings
  methodology: {
    Fees: "Creator fees from coins launched on OTC (Pump.fun bonding curve and PumpSwap), which are routed to OTC's fee wallets, plus the creator fees of the $OTC token itself.",
    Revenue: "Protocol share plus SOL used to buy back and burn $OTC and SOL dividends paid to $OTC holders.",
    ProtocolRevenue: "Share of launcher fees sent to the OTC protocol wallet (12.5% since Oct 3 2026) plus 50% of $OTC's own creator fees.",
    HoldersRevenue: "Share of launcher fees used to buy back and burn $OTC (10% since Oct 3 2026) and, from Sep 13 to Oct 2 2026, 5% paid as SOL dividends to $OTC holders.",
    SupplySideRevenue: "Rewards bought for each launcher coin's holders (67.5% since Oct 3 2026) plus the Desk pot paid to Desk NFT owners (10% of launcher fees and 50% of $OTC's own creator fees).",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.LAUNCHER_FEES]: "Pump.fun and PumpSwap creator fees of OTC launcher coins, claimed into OTC's fee wallets.",
      [LABELS.OTC_TOKEN_FEES]: "PumpSwap creator fees of the $OTC token, claimed by OTC's program.",
    },
    Revenue: {
      [LABELS.PROTOCOL]: "Launcher fee share and $OTC creator fee share sent to the OTC protocol wallet.",
      [LABELS.BUYBACK]: "Launcher fee share sent to the buyback wallet, which buys $OTC on Jupiter and burns it.",
      [LABELS.DIVIDENDS]: "SOL dividends to $OTC holders (Sep 13 - Oct 2 2026).",
    },
    ProtocolRevenue: {
      [LABELS.PROTOCOL]: "Launcher fee share and $OTC creator fee share sent to the OTC protocol wallet.",
    },
    HoldersRevenue: {
      [LABELS.BUYBACK]: "Launcher fee share sent to the buyback wallet, which buys $OTC on Jupiter and burns it.",
      [LABELS.DIVIDENDS]: "SOL dividends to $OTC holders (Sep 13 - Oct 2 2026).",
    },
    SupplySideRevenue: {
      [LABELS.HOLDER_REWARDS]: "Launcher fees kept in the fee wallet and spent on the reward token (stocks, pre-IPO, yield tokens) airdropped to each coin's holders, including transfer rent.",
      [LABELS.DESK_POT]: "Launcher fee share and 50% of $OTC creator fees sent to the Desk pot, paid out to Desk NFT owners.",
    },
  },
};

export default adapter;
