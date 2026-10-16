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

// Wallets of the Feast team's own trading bot, disclosed by the team (trading from block 128003752,
// 2026-10-16). Self-trading, so excluded from volume and fees. Payer is the trade's tx.origin.
export const EXCLUDED_PAYERS = new Set([
  "0x0c50219c4a8f9940eebbeb34f0f9bf40cbb4e3a9",
  "0x0d8aba9385cf3ce919cce312297aa981f994782b",
  "0x154f9ee65ccfd70b9f4c67a9c031d9feb0a983f2",
  "0x3bea88379019beaaf3cf8d3bf690ee603bcfc27c",
  "0x3caa7dac4ad4a4ea09b88e6e6b380c280245008e",
  "0x517815c0685f3755305685eb7c6a24be10e06bc5",
  "0x58692e4ad994d1a500b70ee3adfc06a43b59cb72",
  "0x5c96fa0960bba37468f3420267f08f6a0c879a02",
  "0x6d5599d34684c448571923f6553e24958edb38f9",
  "0x71882eabc17fd82ee9044b0b81d44f255fc69722",
  "0x7724c0c7c63b94e92d95f603aa38bb5d59113225",
  "0x81be08a7d1c941b4117010436aec02f6158f4e31",
  "0x8817b9296013433ccb1b83114fbc1d32fc0de6fd",
  "0x9ee6228748c6cbfc294aea58dbb0f177be86f46e",
  "0xabba7733e9f28905711a92ed6b9cbadf75bb5c17",
  "0xc9c3c02bed9f33ad57b5d85675ca76371b3f6aac",
  "0xd0acba420762b1d78d1c43a01fedee2868fa94e8",
  "0xd5f9c5da887d86efca49e026b2cb744ba5ed5f2a",
  "0xd9d7e2bc6637dec919060d90d1c408c7e780c0d2",
  "0xde89d5aa55322b6e7abf59deaed97476f6b0945a",
  "0xe088549e0dd2a1b5ad6893eebcabe3ad27cd120b",
  "0xecfeda40dfaeaf4b9dc5e4c9d51bc0fa82ab3e08",
  "0xee26266a180363aeb5ea6b01f772158ab7e41ed1",
  "0xf3270a3e53fe6ecac24cb8d1379c258e821d1fad",
]);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const trades = await options.getLogs({ target: FEAST_HOOK, eventAbi: TRADE_EVENT });

  for (const trade of trades) {
    const payer = trade.payer.toLowerCase();
    // buyBackAndBurn emits a Trade with the hook itself as payer: the protocol's own buyback, not user volume
    if (payer === FEAST_HOOK.toLowerCase() || EXCLUDED_PAYERS.has(payer)) continue;
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
    Volume: "Quote-asset value (Binance tokenized stocks or BNB) of every buy and sell in Feast coin pools on PancakeSwap Infinity, one side per trade and gross of the 1% Feast fee, from the Feast hook's Trade event. Excludes the protocol's own buy-back-and-burn swaps and the Feast team's own trading-bot wallets.",
  },
};

export default adapter;
