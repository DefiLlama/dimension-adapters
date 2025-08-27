import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const contracts: {
  [chain: Chain]: { address: string; deployedAt: number };
} = {
  [CHAIN.ETHEREUM]: {
    address: "0xC7b548AD9Cf38721810246C079b2d8083aba8909",
    deployedAt: 1627254000,
  },
  [CHAIN.ARBITRUM]: {
    address: "0x67e30ba093148e835f47Fd5dcf1AF7D0c58E0f6b",
    deployedAt: 1678752000,
  },
  [CHAIN.BASE]: {
    address: "0x49ab24Da055B8550fF88456E701e4FAB72D6987B",
    deployedAt: 1694559600,
  },
  [CHAIN.OPTIMISM]: {
    address: "0xE0611d7A57879734058aCE889569A2E79701fcAf",
    deployedAt: 1674691200,
  },
};

const fetch: FetchV2 = async (options) => {
  const dailyFees = await addTokensReceived({
    options,
    target: contracts[options.chain].address,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {}, version: 2,
  methodology: {
    Fees: "Counts the 0.2% fee taken on swaps.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All fees collected by Summer.fi.",
  },
};

Object.keys(contracts).forEach((chain: Chain) => {
  adapter.adapter![chain] = {
    fetch,
    start: contracts[chain].deployedAt,
  };
});

export default adapter;
