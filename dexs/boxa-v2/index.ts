import { boxaHookAdapter } from "../../helpers/boxa";

// BOXA's V2 hook (BoxaUniHookV2), on the official Uniswap v4 PoolManager; new launches come through BoxaUniLauncherV4
// 0x5999c897033a2425aac81ab2a2de85e5c6350194 (docs: https://boxa.pro, "For builders" / "Contracts").
export default boxaHookAdapter({
  hook: "0x5125be1752de3c7dc16d68fa10b2d6236697eaec",
  poolManager: "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1", // official Uniswap v4 PoolManager on Elysium
  deployBlock: 4589914, // hook deployment, 2026-11-11
  start: "2026-11-11",
  poolRegisteredEvent: "event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator, uint16 creatorBps, uint16 holdersBps, uint16 buybackBps, uint24 buyFee, uint24 sellFee)",
  poolQuoteEvent: "event PoolQuoteAsset(bytes32 indexed poolId, address indexed quote)",
  treasuryShare: "30% of the 1% pool fee plus 10% of any extra tax",
  doublecounted: true, // its swaps are already counted by the uniswap-v4 adapter (same PoolManager)
});
