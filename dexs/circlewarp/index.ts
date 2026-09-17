import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CircleWarp (circlewarp.fun, "Warp") bonding-curve volume on Arc. See fees/circlewarp
// for the fee/revenue side and the full on-chain verification notes.
//
// Only pre-graduation curve trading is counted here, per this repo's launchpad
// convention (count only the launchpad's own curve; post-migration volume belongs to the
// receiving DEX). Post-graduation trading moves to CircleWarp's own WarpDex pools (a
// custom Uniswap V2 fork) - that volume is not yet tracked under any listing.
const LAUNCH_FACTORY = "0x0dCad158e98bC24455f9e94F46709d8a5F6D1255";
// Deep range (~8.5M blocks back to 2026-07-29) versus Arc's other launchpads in this
// repo - see the matching constant in fees/circlewarp for the RPC-depth caveat on the
// first-ever backfill. `cacheInCloud` makes subsequent day-by-day refills cheap.
const LAUNCH_FACTORY_DEPLOY_BLOCK = 12894706;

const TOKEN_CREATED_EVENT =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string metadataURI)";
// usdcGross is Arc's NATIVE 18-decimal USDC representation (msg.value on a payable
// buy/sell call), not the 6-decimal ERC-20 facade - booked via addGasToken, never
// tagged with the ERC-20 address. See fees/circlewarp for the on-chain verification of
// this event's field layout.
const TRADE_EVENT =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 usdcGross, uint256 tokenAmount, uint256 priceX18, uint256 marketCap)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const launches = await options.getLogs({
    target: LAUNCH_FACTORY,
    eventAbi: TOKEN_CREATED_EVENT,
    fromBlock: LAUNCH_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const curves = launches.map((log: any) => log.curve);
  if (!curves.length) return { dailyVolume };

  const trades = await options.getLogs({ targets: curves, eventAbi: TRADE_EVENT });
  for (const log of trades) {
    // usdcGross is the gross value on both sides (verified: matches the pre-fee amount,
    // not net of the 1% curve fee), so no add-back is needed for sells.
    dailyVolume.addGasToken(BigInt(log.usdcGross));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-07-29",
  methodology: {
    Volume: "Gross native-USDC value of every buy and sell on CircleWarp bonding curves. Excludes post-graduation trading on CircleWarp's own WarpDex pools, which is not yet tracked under any listing.",
  },
};

export default adapter;
