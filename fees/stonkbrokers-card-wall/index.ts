import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ROBINHOOD_USDG, ROBINHOOD_WETH } from "../stonkbrokers/helpers";

/**
 * StonkBrokers Card Wall fees: graded trading card gacha on Robinhood Chain.
 *
 * Companion to dexs/stonkbrokers-card-wall (volume). Same AlleyTill cash
 * register (live 2026-09-25):
 *   - PullRequested = ticket paid into the till ($WALL / USDG / ETH / WETH)
 *   - PullRefunded  = in-kind refund when the house cannot serve the pull
 *   - Payout        = $WALL buyback when a winner sells the card back
 *
 * Accounting (collector-crypt card/buyback pattern, fees/AGENTS.md):
 *   Fees / Revenue / ProtocolRevenue = pull payments net of refunds,
 *     minus buyback spends (full cost of revenue).
 *   The till keeps the whole ticket; house margin settles off chain in card
 *   inventory, so there is no separate protocol cut to book.
 *
 * $WALL has no DefiLlama price feed, so $WALL legs use the till's signed USD
 * quotes (window volume-weighted rate from PullRequested.usdCents), same as
 * the volume adapter.
 */

const ALLEY_TILL = "0x668676e967E9C3820ee36eF9AAdC115165eA5676";

const WALL = "0xB03058B8A39f3967DF08d833682C1c99b29821B1";
const ASSET_TOKENS: Record<number, string | null> = {
  0: WALL,
  1: ROBINHOOD_USDG,
  2: null, // native ETH
  3: ROBINHOOD_WETH,
};
const ASSET_WALL = 0;

const PULL_REQUESTED =
  "event PullRequested(uint256 indexed pullId, address indexed player, bytes32 indexed sku, uint8 asset, uint256 amount, uint256 usdCents, bytes32 commit)";
const PULL_REFUNDED = "event PullRefunded(uint256 indexed pullId, uint8 asset, uint256 amount)";
const PAYOUT = "event Payout(uint256 indexed pullId, address indexed to, uint256 amount, bytes32 ref)";

const LABELS = {
  PULL_SALES: "Card Wall gacha pull sales",
  BUYBACK_SPENDS: "Card Wall card buyback spends",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const [pullLogs, refundLogs, payoutLogs] = await Promise.all([
    options.getLogs({ target: ALLEY_TILL, eventAbi: PULL_REQUESTED }),
    options.getLogs({ target: ALLEY_TILL, eventAbi: PULL_REFUNDED }),
    options.getLogs({ target: ALLEY_TILL, eventAbi: PAYOUT }),
  ]);

  // Volume-weighted $WALL/USD rate from this window's $WALL pulls.
  let wallPaid = 0n;
  let wallCents = 0n;
  for (const log of pullLogs) {
    if (Number(log.asset) !== ASSET_WALL) continue;
    wallPaid += BigInt(log.amount);
    wallCents += BigInt(log.usdCents);
  }

  const addWallUsd = (amount: bigint, label: string) => {
    if (amount === 0n) return;
    if (wallPaid > 0n) {
      dailyFees.addUSDValue(Number((amount * wallCents) / wallPaid) / 100, label);
    } else {
      dailyFees.addToken(WALL, amount, label);
    }
  };
  const addAsset = (asset: number, amount: bigint, label: string) => {
    if (amount === 0n) return;
    if (asset === ASSET_WALL) return addWallUsd(amount, label);
    const token = ASSET_TOKENS[asset];
    if (token === undefined) return;
    if (token === null) dailyFees.addGasToken(amount, label);
    else dailyFees.addToken(token, amount, label);
  };

  // Gross ticket sales, net of in-kind refunds of unserved pulls.
  for (const log of pullLogs) addAsset(Number(log.asset), BigInt(log.amount), LABELS.PULL_SALES);
  for (const log of refundLogs) addAsset(Number(log.asset), -BigInt(log.amount), LABELS.PULL_SALES);

  // Full cost of revenue: $WALL paid out when winners sell cards back.
  for (const log of payoutLogs) addWallUsd(-BigInt(log.amount), LABELS.BUYBACK_SPENDS);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyUserFees: dailyFees,
  };
};

const feesBreakdown = {
  [LABELS.PULL_SALES]:
    "Card Wall gacha pull payments into the AlleyTill (PullRequested in $WALL / USDG / ETH / WETH), net of in-kind refunds (PullRefunded). $WALL legs valued with the till's signed USD quotes.",
  [LABELS.BUYBACK_SPENDS]:
    "Full cost of revenue: $WALL paid out of the till when a winner sells their card back to the house (Payout). Subtracted from fees / revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // hourly buybacks can exceed hourly pull sales
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-25",
  methodology: {
    Fees:
      "Card Wall gacha pull payments into the AlleyTill, net of in-kind refunds, minus $WALL card buyback spends (full cost of revenue). Same collector-crypt card/buyback pattern.",
    Revenue:
      "Equals Fees: pull sales net of refunds and buyback spends. The till keeps the whole ticket; house margin settles off chain in card inventory.",
    ProtocolRevenue:
      "Equals Revenue. No on-chain fee split; the Card Wall team retains the net after buybacks.",
    UserFees:
      "Net amount paid by players: pull tickets minus $WALL received back through card buybacks.",
  },
  breakdownMethodology: {
    Fees: feesBreakdown,
    Revenue: feesBreakdown,
    ProtocolRevenue: feesBreakdown,
  },
};

export default adapter;
