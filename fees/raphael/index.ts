// Raphael Exchange (Aerodrome/Velodrome-v2 Solidly ve(3,3) fork on Robinhood Chain).
// The dexs/raphael adapter already returns the full fee + revenue breakdown
// (per-pool PoolFactory.getFee applied to Swap logs, staked-LP vs unstaked-LP
// split, external bribes), so the fees adapter is the same adapter.
export { default } from "../../dexs/raphael"
