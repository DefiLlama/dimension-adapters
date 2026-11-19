import { exportBuilderAdapter } from "../helpers/hyperliquid";

/**
 * lockin Perps — Hyperliquid perpetuals traded inside the lockin Telegram app
 * (full perps screen and Tap Trade). Every order carries lockin's builder code
 * at 0.1% (f = 100 tenths of a bp), paid to the builder address below, which
 * is also lockin's EVM fee wallet.
 *
 * Website: https://lockin.cash/
 * Twitter: https://x.com/tradeonlockin
 */
const LOCKIN_BUILDER = "0xe1ba8be268f91c011040ac2b44efc9201a52d988";

export default exportBuilderAdapter([LOCKIN_BUILDER], {
  start: "2026-10-23", // first lockin perps orders with the builder code
  breakdownFees: true,
  methodology: {
    Volume: "Notional of Hyperliquid perps trades placed through lockin with its builder code.",
    Fees: "0.1% Hyperliquid builder code fee charged on lockin perps trades.",
    Revenue: "All builder code fees are kept by lockin.",
    ProtocolRevenue: "All builder code fees are kept by lockin.",
  },
});
