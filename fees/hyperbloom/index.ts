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

const HYPERBLOOM_FEE_WALLET = "0x052cdffeacfc503af98a9d87d5406e902c649537";

const transferTopic = ethers.id("Transfer(address,address,uint256)");

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({noTarget: true, eventAbi: BridgeFillEvent, entireLog: true});

  const txHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const txs: any[] = await getTransactions(options.chain, txHashes, {
    cacheKey: "hyperbloom-bridgefill",
  });

  const validTxHashSet = new Set(
    txs
      .filter(
        (tx) => tx && HYPERBLOOM_ADDRESSES.includes(tx.to?.toLowerCase() ?? "")
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
      if (to !== HYPERBLOOM_FEE_WALLET.toLowerCase()) return;

      const amount = BigInt(l.data);
      const tokenAddr = l.address;
      dailyFees.add(tokenAddr, amount);
    });
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-05-31",
      meta: {
        methodology: {
          Fees: "0.025% trading fees on all trades + positive slippage fees",
          Revenue: "0.025% per trade revenue and positive slippage revenue",
          ProtocolRevenue: "0.025% per trade revenue and positive slippage revenue",
        },
      },
    },
  },
  isExpensiveAdapter: true
};

export default adapter;

