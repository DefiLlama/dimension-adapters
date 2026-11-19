import { CHAIN } from "../helpers/chains";
import { createEvmChainFeesAdapter } from "../helpers/evmChainFees";

// Moved from factory/blockscout.ts: viction.blockscout.com answers "default backend - 404" on every path (UI, /api,
// /api/v2), and the last stored explorer value is 2026-04-30. Gas fees are now summed from RPC receipts instead.
// Check on 2026-04-16: RPC $3.45 vs the stored explorer value $4.
// Fees are not burned: in block 116047203 the 2 user txs paid 59157000000000 wei and the same amount was credited to
// masternode address 0xd7d6634109572e3bed7cece7d1c90f18b7b1c10d, with no other balance change across the 588 masternode
// candidates and their owners (validator contract 0x0000000000000000000000000000000000000088).
// Most txs are masternode signing/randomize txs to 0x...89 / 0x...90 with gasPrice 0; gas prices otherwise vary per tx
// (0.25 to 10 gwei seen on 2026-11-06), so fees use each tx's own gasPrice.
export default createEvmChainFeesAdapter({
  chain: CHAIN.TOMOCHAIN,
  CGToken: "tomochain", // same pricing as the old explorer config
  revenueShare: 0,
  supplySideRevenueShare: 1,
});
