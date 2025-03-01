import { getChainVolumeWithGasToken2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";
import { getPrices } from "../../utils/prices";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/bitflux"
};

const graphs = getChainVolumeWithGasToken2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  priceToken: "coingecko:bitcoin"
});

const methodology = {
  UserFees: "User pays a 0.05% fee on each swap.",
  Fees: "A 0.05% of each swap is collected as trading fees",
  Revenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
  ProtocolRevenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
  SupplySideRevenue: "0.025% of the swap fee is distributed to LPs (50% of total fees)",
  HoldersRevenue: "No direct revenue to token holders",
};

const FEE_PERCENT = 0.0005; // 0.05%
const PROTOCOL_SHARE = 0.5; // 50% of fees

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CORE]: {
      fetch: async (options: any) => {
        const baseData = await graphs(CHAIN.CORE)(options);
        const btcPrice = (await getPrices(["coingecko:bitcoin"], options.endTimestamp))["coingecko:bitcoin"].price;

        const dailyFees = Number(baseData.dailyVolume) * FEE_PERCENT;
        const protocolRevenue = dailyFees * PROTOCOL_SHARE;

        return {
          ...baseData,
          totalVolume: (Number(baseData.totalVolume) * btcPrice).toString(),
          dailyFees: dailyFees.toString(),
          dailyRevenue: protocolRevenue.toString(),
          dailyProtocolRevenue: protocolRevenue.toString(),
          dailySupplySideRevenue: protocolRevenue.toString(),
        };
      },
      start: '2024-11-06',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
