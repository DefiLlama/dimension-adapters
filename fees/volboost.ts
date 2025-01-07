import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token";

const contracts: any = {
  [CHAIN.ETHEREUM]: '0x3b18167886fc10dc1FDE2e5dD9d5afD36f40f538',
  [CHAIN.BSC]: '0x3b18167886fc10dc1FDE2e5dD9d5afD36f40f538',
  [CHAIN.BASE]: '0x3b18167886fc10dc1FDE2e5dD9d5afD36f40f538',
}

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BASE,
  CHAIN.BSC,
];

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: contracts[options.chain],
  });
  dailyFees.resizeBy(0.5)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchFees,
      },
    };
  }, {}),
};

export default adapter;
