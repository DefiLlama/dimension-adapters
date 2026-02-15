import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

const fetch = async (options: FetchOptions) => {
  const baseResult = await getUniV2LogAdapter({
    factory: '0x985BcA32293A7A496300a48081947321177a86FD'
  })(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Add fees with labels: 0.30% total swap fees
  dailyFees.addBalances(baseResult.dailyFees, METRIC.SWAP_FEES);

  // Protocol keeps 0.13% (43.33% of total fees)
  const protocolPortion = baseResult.dailyFees.clone(0.13/0.30);
  dailyRevenue.addBalances(protocolPortion, METRIC.PROTOCOL_FEES);

  // LPs receive 0.17% (56.67% of total fees)
  const lpPortion = baseResult.dailyFees.clone(1 - 0.13/0.30);
  dailySupplySideRevenue.addBalances(lpPortion, METRIC.LP_FEES);

  return {
    dailyVolume: baseResult.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  UserFees: "Users pay 0.30% of each swap",
  Fees: "A 0.30% trading fee is collected on all swaps",
  Revenue: "Protocol keeps 0.13% of swap volume (43.33% of fees)",
  ProtocolRevenue: "Protocol keeps 0.13% of swap volume (43.33% of fees)",
  SupplySideRevenue: "LPs receive 0.17% of swap volume (56.67% of fees)"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees paid by users on each swap, fixed at 0.30% of trade volume"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Portion of swap fees retained by the protocol treasury (0.13% of volume)"
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Portion of swap fees retained by the protocol treasury (0.13% of volume)"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Portion of swap fees distributed to liquidity providers (0.17% of volume)"
  }
}

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.MOONBEAM],
  fetch,
  start: '2022-01-01',
  methodology,
  breakdownMethodology,
};

export default adapter;
