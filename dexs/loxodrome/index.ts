import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const factories = [
  "0x92bfa051bf12a0aef9a5e1ac8b2aa7dc1b05a406",
  "0x9442E8d017bb3dC2Ba35d75204211e60f86fF0F8",
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  await Promise.all(
    factories.map(async (factory) => {
      const { dailyVolume: factoryVolume } = await getUniV2LogAdapter({ factory })(options);
      dailyVolume.addBalances(factoryVolume);
    })
  );
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.IOTEX]: {
      fetch,
      start: '2024-01-15',
    },
  },
};

export default adapter;