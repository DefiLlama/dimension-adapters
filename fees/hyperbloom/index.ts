import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions, getTxReceipts } from "../../helpers/getTxReceipts";

const BridgeFillEvent =
  "event BridgeFill(bytes32 source, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const HYPERBLOOM_ADDRESSES = [
  "0x4212a77e4533eca49643d7b731f5fb1b2782fe94", //new
  "0x74cddb25b3f230200b28d79ce85c43991648954a", //old
];

const INTEGRATORS_ADDRESSES = [
  "0x0a0758d937d1059c356D4714e57F5df0239bce1A", // LI.FI diamond
  "0x3e851976DCA1bc02A2F35Ce926dCAFD1dEB3359b",  // LI.FI 
  '0xF75584eF6673aD213a685a1B58Cc0330B8eA22Cf' // Enso
];

const HYPERBLOOM_FEE_WALLETS = [
  "0x052cdffeacfc503af98a9d87d5406e902c649537",
  "0xeca3dda84df5c0013621c180fa86a9a6188719ae",
  "0xd1b1cdb10098ccd59057bd3a3ff26c3c21277fec",
].map(a => a.toLowerCase());

const transferTopic = ethers.id("Transfer(address,address,uint256)");

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

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

  const receipts = await getTxReceipts(
    options.chain,
    Array.from(validTxHashSet),
    { cacheKey: "hyperbloom-aggregator-receipts" }
  );

  receipts.forEach((receipt) => {
    if (!receipt) return;
    receipt.logs.forEach((l: any) => {
      if (l.topics[0] !== transferTopic) return;
      if (l.topics.length < 3) return;
      const to = "0x" + l.topics[2].slice(26).toLowerCase();
      if (!HYPERBLOOM_FEE_WALLETS.includes(to)) return;

      const amount = BigInt(l.data);
      const tokenAddr = l.address;
      dailyFees.add(tokenAddr, amount);
    });
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "0.025% trading fees on all trades + positive slippage fees",
    Revenue: "0.025% per trade revenue and positive slippage revenue",
    ProtocolRevenue: "0.025% per trade revenue and positive slippage revenue",
  },
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-05-31",
    },
  },
  isExpensiveAdapter: true
};

export default adapter;

