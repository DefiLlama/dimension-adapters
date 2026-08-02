import { alliumHyperliquidUsersExport } from "./utils/alliumUsers";

// Hyperliquid's own orderbook markets
export default [
  { id: "5507", adapter: alliumHyperliquidUsersExport({ market: "perps", start: "2023-06-12" }) }, // Hyperliquid Perps
  { id: "5761", adapter: alliumHyperliquidUsersExport({ market: "spot", start: "2024-12-23" }) }, // Hyperliquid Spot Orderbook
];
