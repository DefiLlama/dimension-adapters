import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExportsV3 } from "../../helpers/dexVolumeLogs";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';

const methodology = {
  UserFees: "Users pay trade fees on each swap.",
  ProtocolRevenue: "Protocol receives some % of trade fees.",
  SupplySideRevenue: "User fees minus Protocol fees.",
  HoldersRevenue: "Holders benefit from buyback using Protocol fees."
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getDexVolumeExportsV3({ factory: poolFactoryAddress, factoryFromBlock: 70309749, chain: CHAIN.FANTOM,  }) as Fetch,
      start: 1699300000,
      meta: { methodology: { ...methodology, } },
    },
    [CHAIN.ARBITRUM]: {
      fetch: getDexVolumeExportsV3({ factory: poolFactoryAddress, factoryFromBlock: 148243463, chain: CHAIN.ARBITRUM,  }) as Fetch,
      start: 1699300000,
      meta: { methodology: { ...methodology, } },
    },
    [CHAIN.BASE]: {
      fetch: getDexVolumeExportsV3({ factory: poolFactoryAddress, factoryFromBlock: 6314325, chain: CHAIN.BASE,  }) as Fetch,
      start: 1699300000,
      meta: { methodology: { ...methodology, } },
    }
  }
}

export default adapters;
