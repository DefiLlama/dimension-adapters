import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0x77777D91c0B8Ec9984a05302E4Ef041dcCf77FeE',
      '0xc8c0e780960f954c3426a32b6ab453248d632b59',
      '0x7FFC3DBF3B2b50Ff3A1D5523bc24Bb5043837B14',
    ]
  })

  return { dailyFees, }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: 0, },
    [CHAIN.BASE]: { fetch, start: 0, },
    [CHAIN.ARBITRUM]: { fetch, start: 0, },
    [CHAIN.POLYGON]: { fetch, start: 0, },
    [CHAIN.ERA]: { fetch, start: 0, },
    [CHAIN.BSC]: { fetch, start: 0, },
    [CHAIN.OPTIMISM]: { fetch, start: 0, },
    [CHAIN.CELO]: { fetch, start: 0, },
    [CHAIN.AVAX]: { fetch, start: 0, },
  },
};
export default adapter;
