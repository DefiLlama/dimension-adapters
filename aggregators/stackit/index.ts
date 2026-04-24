import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xE31eE34E37752d90dF52E251069352ba67284807";

const investmentExecutedAbi = "event InvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";
const basketInvestmentExecutedAbi = "event BasketInvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 feeAmount)";
const planAbi = "function userSIPPlans(address, uint256) view returns (uint256 amount, uint256 frequency, uint256 lastInvestmentTime, bool active, address stablecoin, address targetToken, uint256 totalInvested, uint256 totalTokensBought, uint256 planId)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, api } = options;

  const dailyVolume = createBalances();

  const [singleLogs, basketLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);

  const allLogs = [
    ...singleLogs.map(l => ({ user: l.user, planIndex: l.planIndex, amountIn: l.amountIn })),
    ...basketLogs.map(l => ({ user: l.user, planIndex: l.planIndex, amountIn: l.amountIn })),
  ];

  // Fetch stablecoin address for each log to handle decimals correctly (USDC=6, DAI=18)
  const plans = await api.multiCall({
    abi: planAbi,
    calls: allLogs.map(l => ({ target: CONTRACT, params: [l.user, l.planIndex] })),
  });

  for (let i = 0; i < allLogs.length; i++) {
    const stablecoin = plans[i].stablecoin;
    const amountIn = allLogs[i].amountIn;
    dailyVolume.add(stablecoin, amountIn, "DCA Swaps");
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
  pullHourly: true,
  chains: [CHAIN.ARBITRUM],
  start: "2026-04-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
