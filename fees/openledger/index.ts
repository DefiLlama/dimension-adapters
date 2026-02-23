import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import PromisePool from "@supercharge/promise-pool";

const CREDIT_MANAGER = "0x6a2dbd72ad8441A57f6a98521d1fEe199Be22D15";
const DATANET_FACTORY = "0xaC1Ef5a64D768Ca58D4e701b7ab3456d22A4c878";

const BLOCK_CHUNK_SIZE = 900;

const CreditPurchasedEvent =
  "event CreditPurchased(address indexed user, uint256 amountPaid, uint256 creditAmount)";

const DatanetCreatedEvent =
  "event TransactionInitiated(bytes32 indexed transactionId, address indexed user, uint256 amount)";

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

      const creditLogs = await options.getLogs({
        target: CREDIT_MANAGER,
        eventAbi: CreditPurchasedEvent,
        fromBlock: start,
        toBlock: end,
      });

      creditLogs.forEach((log: any) => {
        dailyFees.addCGToken(
          "openledger-2",
          Number(log.amountPaid) / 1e18
        );
      });

      const datanetLogs = await options.getLogs({
        target: DATANET_FACTORY,
        eventAbi: DatanetCreatedEvent,
        fromBlock: start,
        toBlock: end,
      });

      datanetLogs.forEach((log: any) => {
        dailyFees.addCGToken(
          "openledger-2",
          Number(log.amount) / 1e18
        );
      });
    });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "Users pay OPEN tokens for two primary services: (1) purchasing AI credits to access and interact with AI models, and (2) creating datanets. All payments are made in OPEN tokens.",

  UserFees:
    "All fees are paid by end-users either to purchase AI credits or to create datanets within the protocol.",

  Revenue:
    "All payments made for AI credits and datanet creation are collected by the protocol. Credit payments are deposited into protocol-controlled vaults, while datanet creation fees are sent directly to the protocol treasury.",

  ProtocolRevenue:
    "100% of collected fees are considered protocol revenue at the time of payment. Credit-related funds may later be distributed to model contributors from the vault, but are initially controlled by the protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OPENLEDGER],
  start: "2026-01-01",
  methodology,
};

export default adapter;