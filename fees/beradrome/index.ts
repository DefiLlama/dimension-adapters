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

  const buyLogs = await options.getLogs({
    target: BERO,
    eventAbi:
      "event TOKEN__Buy(address indexed sender, address indexed toAccount, uint256 amountBase)",
  });

  const sellLogs = await options.getLogs({
    target: BERO,
    eventAbi:
      "event TOKEN__Sell(address indexed sender, address indexed toAccount, uint256 amountToken)",
  });

  buyLogs.forEach((log) => {
    const amount = log.amountBase;
    const fee = (amount * SWAP_FEE) / DIVISOR;
    totalFees.add(HONEY, fee);
  });

  sellLogs.forEach((log) => {
    const amount = log.amountToken;
    const fee = (amount * SWAP_FEE) / DIVISOR;
    totalFees.add(BERO, fee);
  });
}

async function addBorrowFees(options: FetchOptions, totalFees: Balances) {

  const borrowLogs = await options.getLogs({
    target: VOTER,
    eventAbi: "event TOKEN__Borrow(address indexed borrower, uint256 amount)",
  });

  borrowLogs.forEach((log) => {
    const amount = log.amount;
    const fee = (amount * BORROW_FEE) / DIVISOR;
    totalFees.add(HONEY, fee);
  });
}

async function addBribes(options: FetchOptions, totalFees: Balances) {

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
    const logs = await options.getLogs({
      target: bribe,
      eventAbi:
        "event Bribe__RewardNotified(address indexed rewardToken, uint256 reward)",
    });

    logs.forEach((log) => {
      totalFees.add(log.rewardToken, log.reward);
    });
  }
}

const BERADROME_REWARD_VAULT = "0x63233e055847eD2526d9275a6cD1d01CAAFC09f0";
const BGT_ADDRESS = "0x656b95E550C07a9ffe548bd4085c72418Ceb1dba";

async function addHoldersRevenue(options: FetchOptions, balances: Balances) {

  const logs = await options.getLogs({
    target: BERADROME_REWARD_VAULT,
    eventAbi: "event RewardAdded(uint256 reward)",
  });

  logs.forEach((log) => {
    balances.add(BGT_ADDRESS, log.reward);
  });
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyBribesRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Fees
  await addBondigCurveFees(options, dailyFees);
  await addBorrowFees(options, dailyFees);

  // Bribes
  await addBribes(options, dailyBribesRevenue);

  // Holders Revenue
  await addHoldersRevenue(options, dailyHoldersRevenue);

  return { dailyFees, dailyBribesRevenue, dailyHoldersRevenue };
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
