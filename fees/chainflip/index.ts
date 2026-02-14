import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const dimensionsEndpoint =
  "https://explorer-service-processor.chainflip.io/defi-llama/fees";

const METRICS = {
  NetworkFees: 'Network Fees',
  IngressEgressBrokerFees: 'Ingress, Egress, Broker Fees',
  SwapFees: 'Swap Fees',
}

const fetch = async (options: FetchOptions) => {
  const dimensionsData = await httpGet(
    `${dimensionsEndpoint}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`,
    { headers: { "x-client-id": "defillama" } }
  );
  
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(dimensionsData.dailyProtocolRevenue, METRICS.NetworkFees);
  dailyFees.addUSDValue(dimensionsData.dailyUserFees, METRICS.IngressEgressBrokerFees);
  dailyFees.addUSDValue(dimensionsData.dailySupplySideRevenue, METRICS.SwapFees);
  
  dailyUserFees.addUSDValue(dimensionsData.dailyUserFees, METRICS.IngressEgressBrokerFees);

  dailySupplySideRevenue.addUSDValue(dimensionsData.dailySupplySideRevenue, METRICS.SwapFees);
  dailySupplySideRevenue.addUSDValue(dimensionsData.dailyUserFees, METRICS.IngressEgressBrokerFees);
  
  dailyRevenue.addUSDValue(dimensionsData.dailyProtocolRevenue, METRICS.NetworkFees);
  
  return {
    dailyFees,

    // Fees collected from burning $FLIP. This is a fixed percentage of swap value.
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,

    // Ingress, Egress, and Broker fees paid by the user per swap
    dailyUserFees,

    // Fees collected by the LP. This is a fixed percentage of swap value.
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.CHAINFLIP],
  fetch,
  start: "2023-11-23", // Protocol start date
  methodology: {
    Fees: "Includes Swap, Broker, Ingress, Egress and Network Fees for Buy/Burn Mechanism",
    Revenue:
      "Fees collected from burning $FLIP. This is a fixed percentage of swap value.",
    UserFees:
      "Ingress, Egress, and Broker fees paid by the user per swap",
    SupplySideRevenue:
      "Fees collected by the LPs + Broker, Ingress and Egress fees",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.SwapFees]: 'Swap fees paid by users to LP.',
      [METRICS.IngressEgressBrokerFees]: 'Broker, Ingress, Egress fees paid by users.',
      [METRICS.NetworkFees]: 'Network Fees for Buy/Burn Mechanism.',
    },
    Revenue: {
      [METRICS.NetworkFees]: 'Network Fees for Buy/Burn Mechanism.',
    },
    SupplySideRevenue: {
      [METRICS.IngressEgressBrokerFees]: 'Broker, Ingress, Egress fees paid by users.',
      [METRICS.SwapFees]: 'Swap fees paid to LP.',
    },
  }
};

export default adapter;
