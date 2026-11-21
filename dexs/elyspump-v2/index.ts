import { elyspumpHookAdapter } from "../../helpers/elyspump";

// ElysPump Launchpad v2: the Uniswap v4 hook on ElysPump's own PoolManager (deployed by the ElysPump admin from Uniswap's
// build; not tracked by the uniswap-v4 adapter). Addresses from https://docs.elysp.com/ ("Deployed contracts").
export default elyspumpHookAdapter({
  hook: "0xe11cafa5901b0aab51eb78251488400f9e4320cc", // Launchpad v2 hook + factory
  poolManager: "0x5fb015a49f5b35073f9ce01c2adb287a75f89600", // ElysPump's Uniswap v4 PoolManager
  deployBlock: 6007, // first v2 Launched log
  start: "2026-10-24",
});
