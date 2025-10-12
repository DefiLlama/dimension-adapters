import { ethers } from "ethers";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions } from "../../helpers/getTxReceipts";

const BridgeFillEvent = "event BridgeFill(bytes32 source, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const HYPERBLOOM_ADDRESSES = [
  "0x4212a77e4533eca49643d7b731f5fb1b2782fe94", //new
  "0x74cddb25b3f230200b28d79ce85c43991648954a", //old
];

const INTEGRATORS_ADDRESSES = [
  "0x0a0758d937d1059c356D4714e57F5df0239bce1A", // LI.FI diamond
  "0x3e851976DCA1bc02A2F35Ce926dCAFD1dEB3359b",  // LI.FI 
  '0xF75584eF6673aD213a685a1B58Cc0330B8eA22Cf' // Enso
];

const iface = new ethers.Interface([BridgeFillEvent]);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs: any[] = await options.getLogs({ noTarget: true, eventAbi: BridgeFillEvent, entireLog: true });

  const txHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const txs: any[] = await getTransactions(options.chain, txHashes, {
    cacheKey: "hyperbloom-bridgefill",
  });

  const VALID_ADDRESSES = [
    ...HYPERBLOOM_ADDRESSES,
    ...INTEGRATORS_ADDRESSES,
  ].map(a => a.toLowerCase());

  const validTxHashSet = new Set(
    txs
      .filter(
        (tx) => tx && VALID_ADDRESSES.includes(tx.to?.toLowerCase() ?? "")
      )
      .map((tx) => tx!.hash.toLowerCase())
  );

  const logsToProcess = logs.filter((log) =>
    validTxHashSet.has(log.transactionHash.toLowerCase())
  );

  // --- BridgeFill deduplication ---
  // BridgeFill first-hop detection
  // A single HyperBloom transaction can emit multiple BridgeFill events (multi-hop route or
  // volume split across different paths). The user's actual deposit is represented by those
  // BridgeFill events whose inputToken has NOT already appeared as an outputToken earlier in
  // the same transaction. We therefore iterate through the logs in ascending logIndex (i.e.
  // execution order), keep track of every outputToken encountered, and add to the volume only
  // the events that satisfy the "first-hop" condition. This removes internal swaps and prevents
  // double counting while still capturing split routes correctly.

  const logsByTx: Record<string, any[]> = {};
  logsToProcess.forEach((log) => {
    const tx = log.transactionHash.toLowerCase();
    if (!logsByTx[tx]) logsByTx[tx] = [];
    logsByTx[tx].push(log);
  });

  Object.values(logsByTx).forEach((txLogs) => {
    txLogs.sort((a, b) => a.logIndex - b.logIndex);

    const outputTokensSeen = new Set<string>();

    txLogs.forEach((log) => {
      const parsed = iface.parseLog(log);
      if (!parsed) return;

      const inputToken = parsed.args.inputToken.toLowerCase();

      if (!outputTokensSeen.has(inputToken)) {
        dailyVolume.add(parsed.args.inputToken, parsed.args.inputTokenAmount);
      }

      outputTokensSeen.add(parsed.args.outputToken.toLowerCase());
    });
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-05-31",
  methodology: {
    Volume: "Volume from Hyperbloom",
  },
  chains: [CHAIN.HYPERLIQUID],
};

export default adapter;