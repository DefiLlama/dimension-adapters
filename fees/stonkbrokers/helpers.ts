import { FetchOptions } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";

// Shared by the StonkBrokers product adapters (stonkbrokers, -anvil,
// -broker-box, -safe-launch, -nightshades, -smart-lp).

export const ZERO = ADDRESSES.null;
export const STONKBROKER = "0xe934e36A439C94017B64a3FecE66AF12099aBF50";
export const ROBINHOOD_WETH = ADDRESSES.robinhood.WETH;
export const ROBINHOOD_USDG = ADDRESSES.robinhood.USDG;

// Uniswap v4 PoolManager on Robinhood Chain.
export const UNI_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const UNI_V4_SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
export const UNI_V4_SWAP_TOPIC0 =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

export type Balances = ReturnType<FetchOptions["createBalances"]>;

/** Add an amount in `token`, or in the gas token when `token` is the zero address. */
export function addProtocolCut(balances: Balances, token: string, amount: bigint, label: string) {
  if (amount <= 0n) return;
  if (!token || token === ZERO) balances.addGasToken(amount, label);
  else balances.addToken(token, amount, label);
}

/** Add a quote amount: native ETH when quote is null, else the quote token. */
export function addQuote(balances: Balances, quote: string | null, amount: bigint, label?: string) {
  if (amount <= 0n) return;
  if (!quote) {
    if (label) balances.addGasToken(amount, label);
    else balances.addGasToken(amount);
  } else if (label) {
    balances.addToken(quote, amount, label);
  } else {
    balances.addToken(quote, amount);
  }
}
