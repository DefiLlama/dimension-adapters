import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token";

const contracts: any = {
  [CHAIN.ETHEREUM]: '0x9d06Fe7F623323086FaFf70ca7BfB2b539ac8C3d',
  [CHAIN.BSC]: '0xc2af820610e055264f928388b85cdede6a21d710',
  [CHAIN.BASE]: '0xcd216f87d8ab4d913e8660606679e9d5b805f220',
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
    dailyProtocolRevenue: dailyFees,
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
  methodology: {
    Fees: "Fees paid by users while using boost services.",
    Revenue: "Fees paid by users while using boost services.",
    ProtocolRevenue: "Fees paid by users while using boost services.",
  }
};

export default adapter;
