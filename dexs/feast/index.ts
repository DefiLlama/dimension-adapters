import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Feast (https://feast.meme) launches every coin straight into a PancakeSwap Infinity CL pool
// attached to one Feast hook, paired with a Binance tokenized stock (bStock, e.g. NVDAB) or WBNB.
// There is no bonding curve: all trading happens in those pools, so the underlying swaps are
// also counted by the pancakeswap-infinity adapter and this adapter is doublecounted.
// Hook: https://bscscan.com/address/0xABFB955e4582f49dc741DCf5354fbB0edaD0A7c5
// Factory: https://bscscan.com/address/0x1003b54659F5e31A7391fEBE824A137e8CDa90da
export const FEAST_HOOK = "0xABFB955e4582f49dc741DCf5354fbB0edaD0A7c5";

// One Trade per swap in a Feast pool, emitted by the hook's afterSwap (FeastHook._emitTrade) with
// the trader's own amounts: quoteAmount is what a buyer paid (1% fee included) or what a seller
// received (fee deducted), and it includes the part of a sale the hook fills from its own burn
// bucket (InternalFill), which never reaches the pool's Swap event.
const TRADE_EVENT = "event Trade(address indexed coin, address indexed quote, bool buy, uint256 coinAmount, uint256 quoteAmount, uint160 sqrtPriceX96After, address indexed payer, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const trades = await options.getLogs({ target: FEAST_HOOK, eventAbi: TRADE_EVENT });

  for (const trade of trades) {
    const payer = trade.payer.toLowerCase();
    // buyBackAndBurn emits a Trade with the hook itself as payer: the protocol's own buyback, not user volume
    if (payer === FEAST_HOOK.toLowerCase()) continue;
    // volume is gross of the fee: a buy's quoteAmount already includes it, a sale's is net of it
    const quoteAmount = trade.buy ? BigInt(trade.quoteAmount) : BigInt(trade.quoteAmount) + BigInt(trade.fee);
    dailyVolume.add(trade.quote, quoteAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  // first CoinCreated: block 127031147, 2026-10-11 13:54 UTC
  start: "2026-10-11",
  // Feast pools are PancakeSwap Infinity pools, whose swaps the pancakeswap-infinity adapter already counts
  doublecounted: true,
  methodology: {
    Volume: "Quote-asset value (Binance tokenized stocks or BNB) of every buy and sell in Feast coin pools on PancakeSwap Infinity, one side per trade and gross of the 1% Feast fee, from the Feast hook's Trade event. Excludes the protocol's own buy-back-and-burn swaps.",
  },
};

export default adapter;
