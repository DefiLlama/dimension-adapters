import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xE31eE34E37752d90dF52E251069352ba67284807";
const DEPLOY_BLOCK = 455464291;

const sipCreatedAbi = "event SIPCreated(address indexed user, uint256 planIndex, uint256 planId, uint256 amount, uint256 frequency, address stablecoin, address targetToken)";
const basketCreatedAbi = "event BasketSIPCreated(address indexed user, uint256 planIndex, uint256 planId, uint256 amount, uint256 frequency, address stablecoin, uint256 basketSize)";

const investmentExecutedAbi = "event InvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";
const basketInvestmentExecutedAbi = "event BasketInvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 feeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, getToBlock } = options;
  const toBlock = await getToBlock()
  // Fetch ALL creation events from deploy to end of current slice so plans
  // created in earlier hours are always in the map.
  const [createdLogs, basketCreatedLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: sipCreatedAbi, fromBlock: DEPLOY_BLOCK, cacheInCloud: true, toBlock }),
    getLogs({ target: CONTRACT, eventAbi: basketCreatedAbi, fromBlock: DEPLOY_BLOCK, cacheInCloud: true, toBlock }),
  ]);

  const stablecoinMap = new Map<string, string>();
  for (const l of createdLogs) stablecoinMap.set(l.planId.toString(), l.stablecoin);
  for (const l of basketCreatedLogs) stablecoinMap.set(l.planId.toString(), l.stablecoin);

  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const [execLogs, basketExecLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);
  for (const l of [...execLogs, ...basketExecLogs]) {
    const stablecoin = stablecoinMap.get(l.planId.toString());
    if (stablecoin) {
      dailyVolume.add(stablecoin, l.amountIn);
      dailyFees.add(stablecoin, l.feeAmount, "Swap Fees");
    }
  }

  return { 
    dailyVolume, 
    dailyFees, 
    dailyRevenue: dailyFees, 
    dailyProtocolRevenue: dailyFees, 
    dailyUserFees: dailyFees };
};

const methodology = {
  Volume: "Total stablecoin value of all DCA swaps executed through Stackit on Arbitrum, aggregated from InvestmentExecuted and BasketInvestmentExecuted on-chain events.",
  Fees: "0.5% platform fee collected on every DCA swap executed through Stackit on Arbitrum.",
  Revenue: "Stackit retains 100% of platform fees — no liquidity providers to share with.",
  ProtocolRevenue: "All fees go directly to the Stackit protocol (feeCollector address).",
  UserFees: "Fees paid directly by users as a percentage of each scheduled investment swap.",
};

const breakdownMethodology = {
  Fees: { "Swap Fees": "0.5% of each DCA swap amount, from InvestmentExecuted and BasketInvestmentExecuted events." },
  Revenue: { "Swap Fees": "Platform retains all swap fees — no LP revenue share." },
  ProtocolRevenue: { "Swap Fees": "All swap fees sent to feeCollector address." },
  UserFees: { "Swap Fees": "End-users pay 0.5% of each scheduled investment." }
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
