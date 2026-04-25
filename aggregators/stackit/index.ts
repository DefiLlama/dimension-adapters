import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CONTRACT, investmentExecutedAbi, basketInvestmentExecutedAbi, getPlanIdToStablecoin } from "../../helpers/stackit";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyVolume = createBalances();

  const [stablecoinByPlanId, execLogs, basketExecLogs] = await Promise.all([
    getPlanIdToStablecoin(options),
    getLogs({ target: CONTRACT, eventAbi: investmentExecutedAbi }),
    getLogs({ target: CONTRACT, eventAbi: basketInvestmentExecutedAbi }),
  ]);

  let missing = 0;
  for (const l of [...execLogs, ...basketExecLogs]) {
    const stablecoin = stablecoinByPlanId.get(l.planId.toString());
    if (!stablecoin) { missing++; continue; }
    dailyVolume.add(stablecoin, l.amountIn, "DCA Swaps");
  }
  if (missing > 0) console.warn(`[stackit aggregators] ${missing} execution event(s) had no matching creation event — planId map may be incomplete`);

  return { dailyVolume };
};

const methodology = {
  Volume: "Total stablecoin value of all DCA swaps executed through Stackit on Arbitrum, aggregated from InvestmentExecuted and BasketInvestmentExecuted on-chain events.",
};

const breakdownMethodology = {
  Volume: { "DCA Swaps": "amountIn from each scheduled investment execution — the stablecoin amount swapped into the target token(s)." },
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
