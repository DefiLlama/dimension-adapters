import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const MEGACUBE_V5 = "0x7ab966239f3b8cff285594c761424f11b672fd78";

const BLOCK_DESTROYED_EVENT =
  "event BlockDestroyed(address indexed destroyer, uint256 indexed layerId, uint256 containerId, uint256 blockId, uint256 licenseId)";

const fetch = async ({ getLogs }: FetchOptions) => {
  const logs = await getLogs({
    target: MEGACUBE_V5,
    eventAbi: BLOCK_DESTROYED_EVENT,
    entireLog: true,
  });

  const transactions = new Set<string>();

  logs.forEach((log: any) => {
    const transactionHash = log.transactionHash;

    if (transactionHash) transactions.add(transactionHash.toLowerCase());
  });

  return {
    dailyTransactionsCount: transactions.size,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2026-04-22",
    },
  },
  methodology: {
    DailyTransactionsCount:
      "Counts unique transaction hashes that emitted one or more BlockDestroyed events through the MegaCubeV5 contract. Batch mining operations are counted as one transaction.",
  },
};

export default adapter;
