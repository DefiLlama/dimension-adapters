import ADDRESSES from "../../helpers/coreAssets.json";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";

// ScroogeRouter, Scrooge's router on Robinhood Chain, shared by aggregators/scrooge (volume) and fees/scrooge (fees). It
// settles the route Scrooge picks, takes Scrooge's fee from the output and emits one event per swap: Swapped for a route
// through one venue, SwappedMany for a route split across several. Scrooge's other contracts (the swap widget's partner
// contract, multi-token sells and buys, recurring buys) all settle through it, so its events count each of their swaps once.
// Verified source: https://repo.sourcify.dev/4663/0x7668b4F9E949E392DC3A1B562bf03086Fd35bb82
export const ROUTER = "0x7668b4F9E949E392DC3A1B562bf03086Fd35bb82";
export const SwappedEvent = "event Swapped(address indexed sender, address indexed recipient, address indexed target, address tokenIn, address tokenOut, uint256 amountIn, uint256 received, uint256 fee)";
export const SwappedManyEvent = "event SwappedMany(address indexed sender, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 received, uint256 fee, uint256 legs)";

// $SCROOGE, Scrooge's token: CoinGecko's "scrooge-2" lists this contract on Robinhood Chain
// (https://www.coingecko.com/en/coins/scrooge-2), and decimals() returns 18. Its address is not priced by the coins
// API, so it is valued through its CoinGecko id.
const SCROOGE = "0x4da3916d3ae6feece32ec8a2c4856d4abeb41bfd";
const SCROOGE_CG = "scrooge-2";
const SCROOGE_DECIMALS = 1e18;

// Native ETH is address(0) on both sides of the router's events. A side is valued by preference where it is ETH or a
// core asset, then where it is SCROOGE (paying with SCROOGE for a new token, or selling one for SCROOGE).
const NATIVE = ADDRESSES.null;
export const rank = (token: string) => {
  const t = token.toLowerCase();
  if (t === NATIVE || isCoreAsset(CHAIN.ROBINHOOD, t)) return 2;
  return t === SCROOGE ? 1 : 0;
};
export const addToken = (balances: any, token: string, amount: bigint, label?: string) => {
  if (token.toLowerCase() === SCROOGE) balances.addCGToken(SCROOGE_CG, Number(amount) / SCROOGE_DECIMALS, label);
  else balances.add(token, amount, label);
};
