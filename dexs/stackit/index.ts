import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xE31eE34E37752d90dF52E251069352ba67284807";

const investmentExecutedAbi = "event InvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";
const basketInvestmentExecutedAbi = "event BasketInvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 feeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyVolume = createBalances();

  const [singleLogs, basketLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);

  for (const log of singleLogs) {
    dailyVolume.addUSDValue(Number(log.amountIn) / 1e6);
  }

  for (const log of basketLogs) {
    dailyVolume.addUSDValue(Number(log.amountIn) / 1e6);
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Total stablecoin value of all DCA swaps executed through Stackit on Arbitrum, aggregated from InvestmentExecuted and BasketInvestmentExecuted on-chain events.",
};

const breakdownMethodology = {
  Volume: {
    "DCA Swaps": "amountIn from each scheduled investment execution — the stablecoin amount swapped into the target token(s).",
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
