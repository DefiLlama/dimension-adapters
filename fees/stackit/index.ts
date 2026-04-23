import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xE31eE34E37752d90dF52E251069352ba67284807";

const investmentExecutedAbi = "event InvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";
const basketInvestmentExecutedAbi = "event BasketInvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 feeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();

  const [singleLogs, basketLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);

  for (const log of singleLogs) {
    dailyFees.addUSDValue(Number(log.feeAmount) / 1e6);
  }

  for (const log of basketLogs) {
    dailyFees.addUSDValue(Number(log.feeAmount) / 1e6);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Fees: "0.5% platform fee collected on every DCA swap executed through Stackit on Arbitrum.",
  Revenue: "Stackit retains 100% of platform fees — no liquidity providers to share with.",
  UserFees: "Fees paid directly by users as a percentage of each scheduled investment swap.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "0.5% of each DCA swap amount, collected from InvestmentExecuted and BasketInvestmentExecuted events.",
  },
  Revenue: {
    "Swap Fees": "Platform retains all swap fees, sent to feeCollector address.",
  },
  UserFees: {
    "Swap Fees": "End-users pay 0.5% of each scheduled investment.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2026-04-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
