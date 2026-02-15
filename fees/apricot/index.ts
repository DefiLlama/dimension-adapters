import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceivedDune } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const APRICOT_MAIN_POOL = "7Ne6h2w3LpTNTa7CNYcUs7UkjeJT3oW7jcrXWfVScTXW";

const methodology = {
  Fees: "Interest paid by borrowers on the Apricot Finance lending protocol when they repay loans, plus performance fees from LP token farming (20%) and recursive loan fees (0.075%)",
  Revenue: "20% of all lending interest paid by borrowers goes to the protocol treasury. Additionally, 20% performance fee on LP farming earnings and 0.075% on recursive loans",
  ProtocolRevenue: "Protocol revenue includes 20% of borrow interest, 20% of farming rewards, and recursive loan fees",
  SupplySideRevenue: "80% of lending interest is distributed to depositors"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers when they repay loans on the Apricot Finance lending protocol',
    [METRIC.PERFORMANCE_FEES]: 'Performance fees from LP token farming (20% of farming earnings) and recursive loan fees (0.075% of recursive loan amounts)',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '20% of all borrow interest, farming performance fees, and recursive loan fees retained by the protocol treasury',
  },
  SupplySideRevenue: {
    'Depositor Interest': '80% of borrow interest distributed to depositors who supply liquidity to the lending pool',
  }
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  throw Error('WIP')
  
  const dailyFees = await getSolanaReceivedDune({
    options,
    target: APRICOT_MAIN_POOL,
  });

  // Since protocol takes 20% as revenue, 80% goes to depositors
  const dailyRevenue = dailyFees.clone(0.2, METRIC.PROTOCOL_FEES);
  const dailySupplySideRevenue = dailyFees.clone(0.8, 'Depositor Interest');

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2021-08-25',
};

export default adapter;
