import { CHAIN } from "../helpers/chains";
import { createEvmChainFeesAdapter, createUrlRpcSenders } from "../helpers/evmChainFees";

// Moved from factory/blockscout.ts: cronos.org/explorer now redirects to the Crypto.com explorer (explorer.cronos.com),
// so the Blockscout totalfees endpoint answers 404 (last stored value 2026-08-12). Gas fees are now summed from RPC receipts.
// Like the Blockscout series, only EVM transactions count: block gasUsed also includes Cosmos-native txs (IBC relays,
// staking), which have no EVM receipt.
// Cronos makes a block every ~0.43s (~200k a day) and ~90% of them use no gas, so eth_feeHistory screens each window
// (at most 100 blocks per call on Cronos) and receipts are read only for blocks that used gas. eth_feeHistory fails
// before the fee market was enabled ("ElasticityMultiplier cannot be 0" in Nov/Dec 2021), so those dates throw.
// Fees are not burned: the Ethermint fee market keeps the whole fee in the fee collector, and the distribution
// community_tax is 0 (rest.cronos.org/cosmos/distribution/v1beta1/params), so all of it goes to validators and delegators.
export default createEvmChainFeesAdapter({
  chain: CHAIN.CRONOS,
  CGToken: "crypto-com-chain", // same pricing as the old explorer config
  feeHistoryScreenSize: 100,
  blockChunkSize: 10, // evm.cronos.org and rpc.vvs.finance reject JSON-RPC batches of more than 10 calls
  // archive nodes only: cronos-evm-rpc.publicnode.com keeps history from block ~90.85M (2026-08) and
  // rpc.swiftnodes.io answers eth_getBlockReceipts for pruned heights with an empty list instead of an error
  rpcSenders: createUrlRpcSenders(["https://evm.cronos.org", "https://rpc.vvs.finance"]),
  revenueShare: 0,
  supplySideRevenueShare: 1,
});
