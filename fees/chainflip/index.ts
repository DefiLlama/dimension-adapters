import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const dimensionsEndpoint =
  "https://explorer-service-processor.chainflip.io/defi-llama/fees";

const fetch = async (options: FetchOptions) => {
  const dimensionsData = await httpGet(
    `${dimensionsEndpoint}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`,
    { headers: { "x-client-id": "defillama" } }
  );
  const dailyProtocolRevenue = Number(dimensionsData.dailyProtocolRevenue)
  const dailyUserFees = Number(dimensionsData.dailyUserFees)
  const dailySupplySideRevenue = Number(dimensionsData.dailySupplySideRevenue) + dailyUserFees
  const dailyFees = dailyProtocolRevenue + dailySupplySideRevenue
  return {
    dailyFees,
    // Fees collected from burning $FLIP. This is a fixed percentage of swap value.
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,

    // Ingress, Egress, and Broker fees paid by the user per swap
    dailyUserFees,

    // Fees collected by the LP. This is a fixed percentage of swap value.
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CHAINFLIP]: {
      fetch,
      start: "2023-11-23", // Protocol start date
    },
  },
  methodology: {
    Fees: "Includes Swap, Broker, Ingress, Egress and Network Fees for Buy/Burn Mechanism",
    Revenue:
      "Fees collected from burning $FLIP. This is a fixed percentage of swap value.",
    UserFees:
      "Ingress, Egress, and Broker fees paid by the user per swap",
    SupplySideRevenue:
      "Fees collected by the LPs + Broker, Ingress and Egress fees",
  },
};

export default adapter;
