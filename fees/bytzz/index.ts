import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTxReceipts } from "../../helpers/getTxReceipts";

const TransformedERC20Event = "event TransformedERC20 (address taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const BYTZZ_ADDRESS = "0x80197522c069a86dd8bb437e58c91cfbc05f378b"

const BYTZZ_FEE_WALLET = "0xc26b901aac99B282C1A59327249A7b3e985672F4"

const transferTopic = ethers.id("Transfer(address,address,uint256)");

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({
    target: BYTZZ_ADDRESS,
    eventAbi: TransformedERC20Event,
  });

  const receipts = await getTxReceipts(
    options.chain,
    Array.from(logs.map((l) => l.transactionHash)),
    { cacheKey: "bytzz-transformederc20-receipts" }
  );

  receipts.forEach((receipt) => {
    if (!receipt) return;
    receipt.logs.forEach((l: any) => {
      if (l.topics[0] !== transferTopic) return;
      if (l.topics.length < 3) return;
      const to = "0x" + l.topics[2].slice(26).toLowerCase();
      if (to !== BYTZZ_FEE_WALLET.toLowerCase()) return;

      const amount = BigInt(l.data);
      const tokenAddr = l.address;
      dailyFees.add(tokenAddr, amount);
    });
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "0.1% trading fees on all trades",
    Revenue: "0.1% per trade revenue",
    ProtocolRevenue: "0.1% per trade revenue",
  },
  version: 2,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      start: "2025-08-26",
    },
  },
  isExpensiveAdapter: true
};

export default adapter;

