// Mercurifi DEX (trade.mercuri.finance) - hook-based AMM on Arc: tokens that graduate from the Mercurifi
// Launchpad trade in Uniswap v4 pools opened at graduation, where the protocol's immutable LaunchHook charges
// the same fee the curve did into the same FeeManager. Volume is reconstructed from FeeAccrued events with
// `source` 1 (a swap in a graduated token's pool) at each token's own rate; curve trades are
// dexs/mercurifi-launchpad. The pools live on Uniswap v4's Arc deployment already tracked by dexs/uniswap-v4,
// hence doublecounted. Source (verified on the explorer, full match on Sourcify):
// https://github.com/mercuri-finance/mercuri-launch-contracts
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { mercurifiVolume, SOURCE_POOL } from "./mercurifi-launchpad";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: mercurifiVolume(SOURCE_POOL),
  chains: [CHAIN.ARC],
  doublecounted: true, // graduated pools live on Uniswap v4's Arc deployment, tracked by dexs/uniswap-v4
  // Mainnet deployment, block 22060881; the first pool opens at the first graduation.
  start: "2026-09-21",
  methodology: {
    Volume:
      "The USDC side of every swap in a graduated token's Uniswap v4 pool, where the LaunchHook charges the token's immutable fee rate (FeeAccrued with source 1). Trades still on a bonding curve are counted by dexs/mercurifi-launchpad, not here.",
  },
};

export default adapter;
