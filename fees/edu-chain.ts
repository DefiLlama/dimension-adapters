import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { getArbitrumNitroFeesWei } from "../helpers/arbitrumNitroFees";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  protocolType: ProtocolType.CHAIN,
  chains: [CHAIN.EDU_CHAIN],
  // first day checked to run; on 2024-11-08 the chain went over an hour without a block and the block lookup refuses
  // ("more than 1 hour away"). Pre-launch fees are dust: the fee account held 0.027 EDU at block 100 (2024-11-05).
  start: "2024-11-15",
  skipBreakdownValidation: true,
  fetch: async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    dailyFees.addGasToken(await getArbitrumNitroFeesWei(options), METRIC.TRANSACTION_GAS_FEES);
    return { dailyFees };
  },
  methodology: {
    Fees: "Gas fees paid in EDU for transactions on EDU Chain, execution fees plus the parent-chain data fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Gas fees paid by EDU Chain users, measured as the growth of the accounts ArbOS credits fees to (network and infra fee accounts, the parent-chain data fee pool and the batch poster's fee collector).",
    },
  },
};

export default adapter;
