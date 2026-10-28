import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ROBINHOOD_USDG, ROBINHOOD_WETH } from "../../fees/stonkbrokers/helpers";

/**
 * StonkBrokers Card Wall: graded trading card gacha on Robinhood Chain,
 * run by the Card Wall team (a StonkBrokers ecosystem project; $WALL launched
 * through the StonkBrokers anti-snipe curve and trades on the Anvil AMM).
 *
 * AlleyTill is the single cash register for the card gacha (live 2026-09-25):
 *   - every pull is paid into the till in $WALL, USDG, ETH or WETH against a
 *     signed USD quote (PullRequested carries the asset, the amount and the
 *     USD price of the SKU in cents);
 *   - the prize card is minted by Collector Crypt into the Card Wall
 *     inventory wallet and delivered to the winner (PullFulfilled);
 *   - buyback settlement: a winner who sells the card back to the house is
 *     paid out of the till in $WALL (Payout);
 *   - a pull that cannot be served is refunded in kind (PullRefunded).
 *
 * Volume = pull payments net of refunds. Buyback payouts are house
 * settlements, not user volume.
 *
 * Fees = pull payments net of refunds, minus card buyback payouts (card/buyback
 * pattern from fees/collector-crypt: the buyback is subtracted from fees, not
 * booked as supply side). The till keeps the whole ticket and the cost of the
 * prize cards settles off chain, so the net is all revenue to the Card Wall
 * team. As of 2026-10-23 Payout has fired only 7 times (pulls 3-13, 2026-09-25
 * to 09-26), all to 0xbBf2A7f2520237D252cF4490fA2B166e5F56603e, the wallet that
 * made pulls 1-14 and that the till owner withdrew 4.1M $WALL to
 * (tx 0xc34116e8feb54adc742fb0dba06f4264a1ee05f650f44fc0225dbc6f623a2101): a
 * launch test of the sell-back flow. The leg stays so real sell-backs are
 * netted if the house starts paying them.
 *
 * No holders revenue: till withdrawals (Withdrawn) go to the team wallet
 * 0x9c0042eb0e1c33a7c55c5c947a0cdd4eeaf5882d, which sells the $WALL it
 * receives into the Anvil vAMM-WETH/WALL pool 0x472b28cfc7a094ee01b100d078186c3ec29a54ee
 * (e.g. tx 0xb9dc05b5253954058ce3c533aa5262ce026953d4ebc9bedd337cf3caa880ad67);
 * there are no $WALL buybacks or burns.
 *
 * $WALL has no DefiLlama price feed, so $WALL legs are valued with the till's
 * own signed USD quotes: every $WALL pull states its USD price, and the
 * window's volume-weighted $WALL/USD rate from those pulls prices the $WALL
 * refunds and buyback payouts of the same window. USDG / ETH / WETH legs are
 * booked in kind and priced by DefiLlama.
 *
 * The till is not source-verified on Blockscout; the event signatures below
 * were recovered from the deployed bytecode and match the emitted topic0s
 * (PullRequested 0x10f1ba09..., PullFulfilled 0x3ab46ea2..., PullRefunded
 * 0x9dbf47d5..., Payout 0x5fd90f02..., Withdrawn 0xd1c19fbc...). Prize collection
 * (Collector Crypt COLLECTOR, ERC-721): 0xb47a306bD89E8b6fA2b14f553E534AdcD7Cc337F.
 */

const ALLEY_TILL = "0x668676e967E9C3820ee36eF9AAdC115165eA5676";

// Payment assets (till getters wall() / usdg() / weth(); asset 2 = native ETH).
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
  PULL_SALES: "Gacha Pull Sales",
  BUYBACK_SPENDS: "Card Buyback Spends",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const [pullLogs, refundLogs, payoutLogs] = await Promise.all([
    options.getLogs({ target: ALLEY_TILL, eventAbi: PULL_REQUESTED }),
    options.getLogs({ target: ALLEY_TILL, eventAbi: PULL_REFUNDED }),
    options.getLogs({ target: ALLEY_TILL, eventAbi: PAYOUT }),
  ]);

  // Volume-weighted $WALL/USD rate from this window's $WALL pulls (each pull
  // carries the till's signed USD quote for the exact $WALL amount paid).
  let wallPaid = 0n;
  let wallCents = 0n;
  for (const log of pullLogs) {
    if (Number(log.asset) !== ASSET_WALL) continue;
    wallPaid += BigInt(log.amount);
    wallCents += BigInt(log.usdCents);
  }
  const addAsset = (balances: Balances, asset: number, amount: bigint, label?: string) => {
    if (amount === 0n) return;
    if (asset === ASSET_WALL) {
      // usd = amount x (sum cents / sum paid) / 100, kept in integer math.
      if (wallPaid > 0n) balances.addUSDValue(Number((amount * wallCents) / wallPaid) / 100, label);
      // No $WALL pull in the window to quote from: book in kind (priced only
      // once DefiLlama carries a $WALL feed).
      else balances.addToken(WALL, amount, label);
      return;
    }
    const token = ASSET_TOKENS[asset];
    if (token === undefined) throw new Error(`Unknown asset enum ${asset} on a newer till build`);
    if (token === null) balances.addGasToken(amount, label);
    else balances.addToken(token, amount, label);
  };

  // Pull payments, net of the in-kind refunds of pulls the house could not serve.
  for (const log of pullLogs) {
    addAsset(dailyVolume, Number(log.asset), BigInt(log.amount));
    addAsset(dailyFees, Number(log.asset), BigInt(log.amount), LABELS.PULL_SALES);
  }
  for (const log of refundLogs) {
    addAsset(dailyVolume, Number(log.asset), -BigInt(log.amount));
    addAsset(dailyFees, Number(log.asset), -BigInt(log.amount), LABELS.PULL_SALES);
  }

  for (const log of payoutLogs) addAsset(dailyFees, ASSET_WALL, -BigInt(log.amount), LABELS.BUYBACK_SPENDS);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const feesBreakdown = {
  [LABELS.PULL_SALES]:
    "Card pack pulls paid by players in $WALL, USDG, ETH or WETH, minus pulls refunded because the house could not serve them.",
  [LABELS.BUYBACK_SPENDS]:
    "$WALL paid back to winners who sell their card to the house, subtracted from pull sales.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // card buyback payouts in an hour can exceed that hour's pull sales
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-25",
  methodology: {
    Volume:
      "Value of Card Wall card pack pulls paid by players in $WALL, USDG, ETH or WETH, minus refunded pulls; $WALL paid back for card buybacks is not counted.",
    Fees:
      "Card Wall card pack pulls paid by players, minus refunded pulls and the $WALL paid back to winners who sell their card to the house.",
    UserFees:
      "What players spend on Card Wall card pack pulls, net of refunds and of the $WALL they receive back when selling a card to the house.",
    Revenue:
      "Card Wall card pack pulls net of refunds and card buybacks, all kept by the Card Wall team; the cost of the prize cards is paid off chain and is not deducted.",
    ProtocolRevenue:
      "Card Wall card pack pulls net of refunds and card buybacks, all withdrawn to the Card Wall team wallet; there are no $WALL buybacks or burns for holders.",
  },
  breakdownMethodology: {
    Fees: feesBreakdown,
    UserFees: feesBreakdown,
    Revenue: feesBreakdown,
    ProtocolRevenue: feesBreakdown,
  },
};

export default adapter;
