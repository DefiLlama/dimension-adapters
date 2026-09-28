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
 * Volume = pull payments net of refunds only. Buyback payouts (Payout) are
 * house settlements, not user trading volume. The till keeps the whole ticket
 * and the house margin settles off chain in card inventory, so there is no
 * on-chain fee split to book.
 *
 * $WALL has no DefiLlama price feed, so $WALL legs are valued with the till's
 * own signed USD quotes: every $WALL pull states its USD price, and the
 * window's volume-weighted $WALL/USD rate from those pulls prices the $WALL
 * refunds of the same window. USDG / ETH / WETH legs are
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

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [pullLogs, refundLogs] = await Promise.all([
    options.getLogs({ target: ALLEY_TILL, eventAbi: PULL_REQUESTED }),
    options.getLogs({ target: ALLEY_TILL, eventAbi: PULL_REFUNDED }),
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
  const addWallUsd = (amount: bigint) => {
    if (amount === 0n) return;
    if (wallPaid > 0n) {
      // usd = amount x (sum cents / sum paid) / 100, kept in integer math.
      dailyVolume.addUSDValue(Number((amount * wallCents) / wallPaid) / 100);
    } else {
      // No $WALL pull in the window to quote from: book in kind (priced only
      // once DefiLlama carries a $WALL feed).
      dailyVolume.addToken(WALL, amount);
    }
  };
  const addAsset = (asset: number, amount: bigint) => {
    if (amount === 0n) return;
    if (asset === ASSET_WALL) return addWallUsd(amount);
    const token = ASSET_TOKENS[asset];
    if (token === undefined) return; // unknown asset enum on a newer till build
    if (token === null) dailyVolume.addGasToken(amount);
    else dailyVolume.addToken(token, amount);
  };

  // Pull payments, net of the in-kind refunds of pulls the house could not serve.
  for (const log of pullLogs) addAsset(Number(log.asset), BigInt(log.amount));
  for (const log of refundLogs) addAsset(Number(log.asset), -BigInt(log.amount));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-25",
  methodology: {
    Volume:
      "Card Wall gacha pull payments into the AlleyTill (PullRequested amount in $WALL / USDG / ETH / WETH), net of in-kind refunds (PullRefunded). Buyback payouts (Payout) are excluded. $WALL legs are valued with the till's own signed USD quotes (the window's volume-weighted $WALL/USD rate from PullRequested.usdCents); USDG / ETH / WETH legs are priced by DefiLlama.",
  },
};

export default adapter;
