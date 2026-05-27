import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSaddleVolume } from "../../helpers/saddle";

const pools = [
  '0xe8d13664a42B338F009812Fa5A75199A865dA5cD',
  '0xa34C0fE36541fB085677c36B4ff0CCF5fa2B32d6',
  '0x1578C5CF4f8f6064deb167d1eeAD15dF43185afa',
  '0x5FA9412C2563c0B13CD9F96F0bd1A971F8eBdF96',
];

const fetchVolume = async (options: FetchOptions) => {
  const { dailyVolume } = await getSaddleVolume(options, pools);
  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: fetchVolume,
      start: '2022-08-29',
    },
  },
};

export default adapter;
