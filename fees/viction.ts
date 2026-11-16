import { CHAIN } from "../helpers/chains";
import { createEvmChainFeesAdapter, createUrlRpcSenders } from "../helpers/evmChainFees";

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
  // rpc.viction.xyz first: it is the only node that takes a 500-block eth_getBlockReceipts batch (~6 MB, 3-6 s; the
  // helper's default timeout is 10 s). viction.drpc.org rejects batches above 3 calls and 88.rpc.thirdweb.com above 25,
  // and once no batch gets through the helper reads each block and each receipt in its own request (production
  // averaged 18,000 requests per hourly run, a batched run takes ~10). viction.drpc.org stays as the fallback.
  rpcSenders: createUrlRpcSenders(["https://rpc.viction.xyz", "https://viction.drpc.org"]),
  rpcTimeoutMs: 30_000,
  revenueShare: 0,
  supplySideRevenueShare: 1,
});
