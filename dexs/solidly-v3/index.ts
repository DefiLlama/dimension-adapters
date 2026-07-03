import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const configs: any = {
  [CHAIN.ETHEREUM]: {
    factory: '0x70Fe4a44EA505cFa3A57b95cF2862D4fd5F0f687',
    start: '2023-08-18',
  },
  [CHAIN.OPTIMISM]: {
    factory: '0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687',
    start: '2024-01-24',
  },
  [CHAIN.BASE]: {
    factory: '0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687',
    start: '2024-01-24',
  },
  [CHAIN.ARBITRUM]: {
    factory: '0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687',
    start: '2024-01-24',
  },
  // [CHAIN.FANTOM]: {
  //   factory: '0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687',
  //   start: '2024-01-24',
  // },
  [CHAIN.SONIC]: {
    factory: '0x777fAca731b17E8847eBF175c94DbE9d81A8f630',
    start: '2024-12-17',
  },
}

const fetch = async (options:FetchOptions) => {
  return await getUniV3LogAdapter({
    factory: configs[options.chain].factory
  })(options);
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: configs,
  skipBreakdownValidation: true,
}

export default adapter;
