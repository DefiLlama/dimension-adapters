import ADDRESSES from '../../helpers/coreAssets.json'
import { SimpleAdapter, FetchOptions, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const supportedERC20Tokens: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: [
    ADDRESSES.arbitrum.WSTETH,
    "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8",
    ADDRESSES.arbitrum.WETH,
  ],
  [CHAIN.OPTIMISM]: [
    ADDRESSES.optimism.WSTETH,
    "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D",
    ADDRESSES.optimism.WETH_1,
  ],
  [CHAIN.BASE]: [
    ADDRESSES.optimism.WETH_1,
    ADDRESSES.base.wstETH,
    ADDRESSES.base.cbETH,
  ],
};

const fetch = async (options: FetchOptions) => {
  const tokenlist = supportedERC20Tokens[options.chain as CHAIN];
  const fee = await addTokensReceived({
    tokens: tokenlist,
    options,
    target: "0x10cc9d85441f27a500776357758961031218e3ae",
  });

  return {
    dailyFees: fee,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2024-03-10',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: '2024-03-10',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2024-03-10',
    },
  },
};

export default adapter;
