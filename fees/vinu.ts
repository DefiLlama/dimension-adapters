import { CHAIN } from "../helpers/chains";
import { createEvmChainFeesAdapter, createUrlRpcSenders } from "../helpers/evmChainFees";

// Moved from factory/blockscout.ts: vinuexplorer.org stopped completing TLS handshakes after 2026-11-03 (plain http only
// serves an nginx 404), so gas fees are summed from RPC receipts instead. Check on 2026-11-02: RPC 19.91 VC ($0.0106)
// vs the stored explorer value $0.01. Receipts also carry VinuChain's feeRefund (staking-quota payback); fees stay gross
// like the explorer's, refunds were 0.0009 VC on 1 of 20,896 txs that day.
// Split: "70% VC to Validators, 30% VC Burned" (https://vinu.gitbook.io/vinuchain/whitepaper/whitepaper/vinuchain-coin-vc, 7.3).
// The SFC (0xFC00FACE00000000000000000000000000000000) contractCommission() is 0.3 at every block sampled 2023-12 to 2026-11;
// it is a constant here because rpc.vinuchain.org has no state for recent past blocks ("missing trie node").
export default createEvmChainFeesAdapter({
  chain: CHAIN.VINUCHAIN,
  CGToken: "vinuchain",
  blockChunkSize: 100, // rpc.vinuchain.org rejects JSON-RPC batches of 200+ calls with "batch too large"
  // rpc.vinuchain.org only: it has no eth_getBlockReceipts, and with the SDK list the other node (207.rpc.thirdweb.com,
  // which answers every call with an error or 429) made the helper give up on batches and read each block and each
  // receipt in its own request (2,246 requests per hourly run in production). Alone, it gets batched
  // eth_getBlockByNumber and eth_getTransactionReceipt calls (17 requests for an hour of blocks).
  rpcSenders: createUrlRpcSenders(["https://rpc.vinuchain.org"]),
  revenueShare: 0.3,
  holdersRevenueShare: 0.3,
  supplySideRevenueShare: 0.7,
});
