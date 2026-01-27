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

  return {
    // Fees collected from burning $FLIP. This is a fixed percentage of swap value.
    dailyProtocolRevenue: dimensionsData.dailyProtocolRevenue,
    dailyRevenue: dimensionsData.dailyProtocolRevenue,

    // Ingress, Egress, and Broker fees paid by the user per swap
    dailyUserFees: dimensionsData.dailyUserFees,
    dailyFees: dimensionsData.dailyUserFees,

    // Fees collected by the LP. This is a fixed percentage of swap value.
    dailySupplySideRevenue: dimensionsData.dailySupplySideRevenue,
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
    Revenue:
      "Fees collected from burning $FLIP. This is a fixed percentage of swap value.",
    UserFees:
      "Ingress, Egress, and Broker fees paid by the user per swap",
    SupplySideRevenue:
      "Fees collected by the LP. This is a fixed percentage of swap value.",
  },
};

export default adapter;
