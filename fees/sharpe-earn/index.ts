import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { promises } from "dns";
import { getBlock } from "../../helpers/getBlock";
import { addTokensReceived } from "../../helpers/token";

const supportedERC20Tokens: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: [
    "0x5979D7b546E38E414F7E9822514be443A4800529",
    "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8",
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  ],
  [CHAIN.OPTIMISM]: [
    "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb",
    "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D",
    "0x4200000000000000000000000000000000000006",
  ],
  [CHAIN.BASE]: [
    "0x4200000000000000000000000000000000000006",
    "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",
    "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
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
      start: async () => 1710037587,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: async () => 1710037587,
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: async () => 1710037587,
    },
  },
};

export default adapter;
