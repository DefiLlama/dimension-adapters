import adapter from "../aggregators/wormswap";

// Share collection logic, but WormSwap's own fees are separate from the
// underlying DEX fees. Only the routed volume is double-counted there.
export default { ...adapter, doublecounted: false };
