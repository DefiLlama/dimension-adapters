import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { Balances } from "@defillama/sdk";

const VOTER = "0xd7ea36ECA1cA3E73bC262A6D05DB01E60AE4AD47";
const BERO = "0x7838CEc5B11298Ff6a9513Fa385621B765C74174";
const DEPLOYMENT_BLOCK = 784968;

const HONEY = "0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce";

const SWAP_FEE = 30n;
const BORROW_FEE = 250n;
const PROVIDER_FEE = 2000n;

const DIVISOR = 10000n;

async function addBondigCurveFees(options: FetchOptions, totalFees: Balances) {
  const { getLogs, getFromBlock, getToBlock } = options;

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const buyLogs = await getLogs({
    target: BERO,
    fromBlock,
    toBlock,
    eventAbi:
      "event TOKEN__Buy(address indexed sender, address indexed toAccount, uint256 amountBase)",
  });

  const sellLogs = await getLogs({
    target: BERO,
    fromBlock,
    eventAbi:
      "event TOKEN__Sell(address indexed sender, address indexed toAccount, uint256 amountToken)",
  });

  buyLogs.forEach((log) => {
    const amount = log.amountBase;
    const fee = (amount * (SWAP_FEE + PROVIDER_FEE)) / DIVISOR;
    totalFees.add(HONEY, fee);
  });

  sellLogs.forEach((log) => {
    const amount = log.amountToken;
    const fee = (amount * (SWAP_FEE + PROVIDER_FEE)) / DIVISOR;
    totalFees.add(BERO, fee);
  });
}

async function addBorrowFees(options: FetchOptions, totalFees: Balances) {
  const { getLogs, getFromBlock, getToBlock } = options;

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const borrowLogs = await getLogs({
    target: VOTER,
    fromBlock,
    toBlock,
    eventAbi: "event TOKEN__Borrow(address indexed borrower, uint256 amount)",
  });

  borrowLogs.forEach((log) => {
    const amount = log.amount;
    const fee = (amount * BORROW_FEE) / DIVISOR;
    totalFees.add(HONEY, fee);
  });
}

async function addBribes(options: FetchOptions, totalFees: Balances) {
  const { getLogs, getFromBlock, getToBlock } = options;

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const plugins = await options.api.call({
    target: VOTER,
    abi: "address[]:getPlugins",
  });

  const bribes = await options.api.multiCall({
    abi: "function getBribe() returns (address)",
    calls: plugins.map((plugin) => ({
      target: plugin,
    })),
  });

  for (const bribe of bribes) {
    const logs = await getLogs({
      target: bribe,
      fromBlock,
      toBlock,
      eventAbi:
        "event Bribe__RewardNotified(address indexed rewardToken, uint256 reward)",
    });

    logs.forEach((log) => {
      totalFees.add(log.rewardToken, log.reward);
    });
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const totalFees = options.createBalances();

  await addBondigCurveFees(options, totalFees);
  await addBorrowFees(options, totalFees);
  await addBribes(options, totalFees);

  return { totalFees };
}

const adapter: Adapter = {
  adapter: {
    berachain: {
      fetch,
      start: "2025-02-06",
    },
  },
  version: 2,
};

export default adapter;
