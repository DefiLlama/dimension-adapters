import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import PromisePool from "@supercharge/promise-pool";

const CREDIT_MANAGER = "0x6a2dbd72ad8441A57f6a98521d1fEe199Be22D15";
const BLOCK_CHUNK_SIZE = 900; // OpenLedger RPC has 1000 block limit

const CreditPurchasedEvent = "event CreditPurchased(address indexed user, uint256 amountPaid, uint256 creditAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const chunks: { start: number; end: number }[] = [];
  for (let start = fromBlock; start <= toBlock; start += BLOCK_CHUNK_SIZE) {
    const end = Math.min(start + BLOCK_CHUNK_SIZE - 1, toBlock);
    chunks.push({ start, end });
  }

  await PromisePool.withConcurrency(5)
    .for(chunks)
    .process(async ({ start, end }) => {
      const logs = await options.getLogs({
        target: CREDIT_MANAGER,
        eventAbi: CreditPurchasedEvent,
        fromBlock: start,
        toBlock: end,
      });

      logs.forEach((log: any) => {
        dailyFees.addCGToken('openledger-2', Number(log.amountPaid) / 1e18);
      });
    }
  );

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const methodology = {
  Fees: "OPEN token payments made by users to purchase AI model credits. Users deposit OPEN tokens which are converted into credits to access and chat with AI models.",
  UserFees: "All fees are paid by end-users purchasing credits to use AI models provided by admins and contributors.",
  Revenue: "Credit purchase payments collected by the protocol. Model admins and contributors earn rewards which are redeemable as OPEN tokens.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OPENLEDGER],
  start: "2026-01-01",
  methodology,
};
export default adapter;
