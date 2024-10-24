import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const data = await queryDune("4187430", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return {
    dailyVolume: chainData.volume_24,
    totalVolume: chainData.volume,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1681599600,
      meta: {
        methodology: {
          totalVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol since launch.",
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
};

export default adapter;
