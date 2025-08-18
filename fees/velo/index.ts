import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const config: any = {
  bsc: {
    targets: ["0x6C22422f4044dfBA79f4EA6BbB9C09162c3BF912"],
    tokens: [
      ADDRESSES.bsc.BUSD,
      ADDRESSES.bsc.USDT,
      ADDRESSES.bsc.WBNB,
      "0xf486ad071f3bEE968384D2E39e2D8aF0fCf6fd46", // VELO
      "0xBe0D3526fc797583Dada3F30BC390013062A048B" , // PLEARN
      "0x80458Df7142Ab707346020A180C44d02271C64Be", // USDV
      "0xC2d4A3709e076A7A3487816362994a78ddaeabB6", // EVRY
    ]
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    ...config[options.chain],
    options,
  });

  return { dailyFees };
};

const adapters: SimpleAdapter = {
  adapter: Object.keys(config).reduce(
    (all, chain) => ({
      ...all,
      [chain]: { fetch, start: '2021-10-12' },
    }),
    {}
  ),
  version: 2,
};
export default adapters;