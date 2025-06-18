import { ethers } from "ethers";
import {
  FetchOptions,
  FetchResultVolume,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions } from "../../helpers/getTxReceipts";

const BridgeFillEvent =
  "event BridgeFill(bytes32 source, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const iface = new ethers.Interface([BridgeFillEvent]);

const fetch: any = async (
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();

  const logs: any[] = await options.getLogs({
    noTarget: true,
    topic: "0xe59e71a14fe90157eedc866c4f8c767d3943d6b6b2e8cd64dddcc92ab4c55af8",
    eventAbi: BridgeFillEvent,
    entireLog: true,
  });

  const txHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const txs: any[] = await getTransactions(options.chain, txHashes, {
    cacheKey: "hyperbloom-bridgefill",
  });

  const HYPERBLOOM_ADDRESSES = [
    "0x4212a77e4533eca49643d7b731f5fb1b2782fe94", //new
    "0x74cddb25b3f230200b28d79ce85c43991648954a", //old
  ];

  const validTxHashSet = new Set(
    txs
      .filter(
        (tx) => tx && HYPERBLOOM_ADDRESSES.includes(tx.to?.toLowerCase() ?? "")
      )
      .map((tx) => tx!.hash.toLowerCase())
  );

  const logsToProcess = logs.filter((log) =>
    validTxHashSet.has(log.transactionHash.toLowerCase())
  );

  // --- BridgeFill deduplication ---
  // A single 0x (HyperBloom) transaction can emit multiple BridgeFill events when the bridge
  // route is multi-hop.  The *first* BridgeFill (lowest logIndex) represents the token and
  // amount that the user actually supplied to the bridge.  Subsequent hops only reflect
  // internal swaps and would double-count volume if included.  Hence we keep exactly one
  // BridgeFill per transaction – the one with the smallest logIndex.
  const firstBridgeFillPerTx: Record<string, any> = {};
  logsToProcess.forEach((log) => {
    const tx = log.transactionHash.toLowerCase();
    if (
      !firstBridgeFillPerTx[tx] ||
      log.logIndex < firstBridgeFillPerTx[tx].logIndex
    )
      firstBridgeFillPerTx[tx] = log;
  });

  Object.values(firstBridgeFillPerTx).forEach((log) => {
    const parsed = iface.parseLog(log);
    if (!parsed) return;
    dailyVolume.add(parsed.args.inputToken, parsed.args.inputTokenAmount);
  });
  
  return { dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetch,
      start: "2025-05-31",
      meta: {
        methodology: {
          Volume: 'Get volume data from HyperBloom project api.'
        }
      }
    },
  },
};

export default adapter;
