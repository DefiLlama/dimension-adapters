import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CONTRACT, investmentExecutedAbi, basketInvestmentExecutedAbi, getPlanIdToStablecoin } from "../../helpers/stackit";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyUserFees = createBalances();

  const [stablecoinByPlanId, execLogs, basketExecLogs] = await Promise.all([
    getPlanIdToStablecoin(options),
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);

  let missing = 0;
  for (const l of [...execLogs, ...basketExecLogs]) {
    const stablecoin = stablecoinByPlanId.get(l.planId.toString());
    if (!stablecoin) { missing++; continue; }
    dailyFees.add(stablecoin, l.feeAmount, "Swap Fees");
    dailyRevenue.add(stablecoin, l.feeAmount, "Swap Fees");
    dailyProtocolRevenue.add(stablecoin, l.feeAmount, "Swap Fees");
    dailyUserFees.add(stablecoin, l.feeAmount, "Swap Fees");
  }
  if (missing > 0) console.warn(`[stackit fees] ${missing} execution event(s) had no matching creation event — planId map may be incomplete`);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyUserFees };
};

const methodology = {
  Fees: "0.5% platform fee collected on every DCA swap executed through Stackit on Arbitrum.",
  Revenue: "Stackit retains 100% of platform fees — no liquidity providers to share with.",
  ProtocolRevenue: "All fees go directly to the Stackit protocol (feeCollector address).",
  UserFees: "Fees paid directly by users as a percentage of each scheduled investment swap.",
};

const breakdownMethodology = {
  Fees: { "Swap Fees": "0.5% of each DCA swap amount, from InvestmentExecuted and BasketInvestmentExecuted events." },
  Revenue: { "Swap Fees": "Platform retains all swap fees — no LP revenue share." },
  ProtocolRevenue: { "Swap Fees": "All swap fees sent to feeCollector address." },
  UserFees: { "Swap Fees": "End-users pay 0.5% of each scheduled investment." },
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
