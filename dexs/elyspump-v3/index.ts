import { elyspumpHookAdapter } from "../../helpers/elyspump";

// ElysPump Launchpad v3: the same hook bytecode as v2, on the official Uniswap v4 PoolManager. Addresses from
// https://docs.elysp.com/ ("Deployed contracts").
export default elyspumpHookAdapter({
  hook: "0xbacf71bf02b8cfe171853c5ec4a060ba2ac1e0cc", // Launchpad v3 hook + factory
  poolManager: "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1", // official Uniswap v4 PoolManager on Elysium
  deployBlock: 264986, // first v3 Launched log
  start: "2026-11-03",
  doublecounted: true, // its swaps are already counted by the uniswap-v4 adapter (same PoolManager)
});
