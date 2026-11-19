import { boxaHookAdapter } from "../../helpers/boxa";

// BOXA's first hook, on its own Uniswap v4 PoolManager (not tracked by the uniswap-v4 adapter). Found from the BOXA token's
// launch tx 0xc172e0db0ea1151302cbb2d92b2ea94d465010662232d70e6f31f4c472ef3408; launches came through the first launcher
// 0x00d4c904f74f74c6920c95e3ee807ab3c52dd205. Tokens launched here keep trading on it (docs: https://boxa.pro, "For builders").
export default boxaHookAdapter({
  hook: "0xbcc1f22d137c1d98dfa5548e4d4261d7aee06acc",
  poolManager: "0x06c63714fbf1f5753017123e2fcfdede4540b2c4",
  deployBlock: 8277, // first PoolRegistered log, 2026-10-26
  start: "2026-10-26",
  poolRegisteredEvent: "event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator, uint16 creatorBps, uint16 holdersBps, uint16 buybackBps, bool antiSnipe, uint24 buyFee, uint24 sellFee)",
  // No quote asset other than native HYPE was ever allowed on this hook (no QuoteAssetSet log); every poolId matches the
  // native-HYPE pool key.
  treasuryShare: "30% of every fee on this hook, extra tax included (FeeTaken logs)",
});
