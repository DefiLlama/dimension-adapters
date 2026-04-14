import { BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const chains = [
  CHAIN.ARBITRUM,
  CHAIN.ETHEREUM,
]

const factories: any = {
  [CHAIN.ETHEREUM]: '0xC480b33eE5229DE3FbDFAD1D2DCD3F3BAD0C56c6',
  [CHAIN.ARBITRUM]: '0x717EF162cf831db83c51134734A15D1EBe9E516a',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: getUniV2LogAdapter({ factory: factories[chain] }),
      },
    };
  }, {} as BaseAdapter),
};

export default adapter;
