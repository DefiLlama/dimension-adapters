import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0x77777D91c0B8Ec9984a05302E4Ef041dcCf77FeE',
    ]
  })

  return { dailyFees, }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 0,
    },
  },
};
export default adapter;
