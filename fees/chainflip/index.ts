import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const dimensionsEndpoint = "https://chainflip-broker.io/defillama/fees"

const fetch = async (timestamp: number) => {
  const dimensionsData = await httpGet(`${dimensionsEndpoint}?timestamp=${timestamp}`, { headers: {"x-client-id": "defillama"}});

  return {
    timestamp: timestamp,

    // All fees and value collected from all sources, this also includes liquid staking rewards, generated yields and possible mint and burn fees paid by LP (but not transaction or gas fees).
    dailyFees: dimensionsData.dailyFees, 

    // Fees paid by protocol users excluding gas fees. This includes swap fees to open/close positions, borrow fees and all fees user has to pay.
    dailyUserFees: dimensionsData.dailyUserFees, 

    // (FLIP Burn) Revenue of the protocol governance, this includes treasury and gov token holders
    dailyRevenue: dimensionsData.dailyRevenue,

    // Value earned by liquidity providers
    dailySupplySideRevenue: dimensionsData.dailySupplySideRevenue,

    // Cumulative value of dailyFees
    totalFees: dimensionsData.totalFees, 

    // Cumulative value of dailyUserFees
    totalUserFees: dimensionsData.totalUserFees,

    // Cumulative value of dailyRevenue
    totalRevenue: dimensionsData.totalRevenue, 

    // Cumulative value of dailySupplySideRevenue
    totalSupplySideRevenue: dimensionsData.totalSupplySideRevenue
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CHAINFLIP]: {
      fetch,
      start: '2024-05-31', // First decent swap was 2024-05-31 09:22:30.000000
      runAtCurrTime: true,
      meta: {
        methodology: {
          Fees: "Ingress, Broker, LP, Protocol and Egress fees.",
          UserFees: "Broker, LP, Protocol fees.",
          Revenue: "Protocol burns 0.10% of each swap.",
          SupplySideRevenue: "LP pools have a 0.05% fee.",
        }
      }
    },
  },
};

export default adapter;
