import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexFeesExports, exportDexVolumeAndFees } from "../../helpers/dexVolumeLogs";


const FACTORY_ADDRESS = '0xAAA16c016BF556fcD620328f0759252E29b1AB57';

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.LINEA]: 1705968000,
}

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol. 5% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 75% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (options: FetchOptions) => {
        const v1Results = await exportDexVolumeAndFees({ chain: CHAIN.LINEA, factory: FACTORY_ADDRESS,})(options.endTimestamp, {}, options)

        return v1Results;
      },
      start: startTimeV2[CHAIN.LINEA],
      meta: {
        methodology: {
          ...methodology,
          UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
        },
      },
    },
  },
};

export default adapter;
