import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xE31eE34E37752d90dF52E251069352ba67284807";

const sipCreatedAbi = "event SIPCreated(address indexed user, uint256 planIndex, uint256 planId, uint256 amount, uint256 frequency, address stablecoin, address targetToken)";
const basketCreatedAbi = "event BasketSIPCreated(address indexed user, uint256 planIndex, uint256 planId, uint256 amount, uint256 frequency, address stablecoin, uint256 basketSize)";
const investmentExecutedAbi = "event InvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";
const basketInvestmentExecutedAbi = "event BasketInvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 feeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyUserFees = createBalances();

  // Build planId → stablecoin map from creation events (immutable at creation time)
  const [createdLogs, basketCreatedLogs, execLogs, basketExecLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: sipCreatedAbi, fromBlock: 0 }),
    getLogs({ target: CONTRACT, eventAbi: basketCreatedAbi, fromBlock: 0 }),
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);

  const stablecoinByPlanId = new Map<string, string>();
  for (const l of createdLogs) stablecoinByPlanId.set(l.planId.toString(), l.stablecoin);
  for (const l of basketCreatedLogs) stablecoinByPlanId.set(l.planId.toString(), l.stablecoin);

  for (const l of execLogs) {
    const stablecoin = stablecoinByPlanId.get(l.planId.toString());
    if (!stablecoin) continue;
    dailyFees.add(stablecoin, l.feeAmount);
    dailyRevenue.add(stablecoin, l.feeAmount);
    dailyProtocolRevenue.add(stablecoin, l.feeAmount);
    dailyUserFees.add(stablecoin, l.feeAmount);
  }

  for (const l of basketExecLogs) {
    const stablecoin = stablecoinByPlanId.get(l.planId.toString());
    if (!stablecoin) continue;
    dailyFees.add(stablecoin, l.feeAmount);
    dailyRevenue.add(stablecoin, l.feeAmount);
    dailyProtocolRevenue.add(stablecoin, l.feeAmount);
    dailyUserFees.add(stablecoin, l.feeAmount);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyUserFees };
};

const methodology = {
  Fees: "0.5% platform fee collected on every DCA swap executed through Stackit on Arbitrum.",
  Revenue: "Stackit retains 100% of platform fees — no liquidity providers to share with.",
  ProtocolRevenue: "All fees go directly to the Stackit protocol (feeCollector address).",
  UserFees: "Fees paid directly by users as a percentage of each scheduled investment swap.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ARBITRUM],
  start: "2026-04-23",
  methodology,
};

export default adapter;
