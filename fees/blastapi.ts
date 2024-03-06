import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";


type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.ETHEREUM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.BSC]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.AVAX]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.MOONBEAM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.FANTOM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.POLYGON]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.XDAI]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
  [CHAIN.OPTIMISM]: '0xfb181a48b102580539b9b8aca6b1617ef0c80bf8',
}

const fetch = (chain: Chain) => {
  return async (timestamp: number , _: ChainBlocks, { createBalances, getLogs,  }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances();
    (await getLogs({
      target: marketplace_address[chain],
      eventAbi: 'event Deposit (address indexed account, address indexed erc20, uint256 amount)'
    })).forEach((e: any) =>       dailyFees.add(e.erc20, e.amount))
    return { dailyFees, timestamp, dailyRevenue: dailyFees };
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: 1675382400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1675382400,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1675382400,
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetch(CHAIN.MOONBEAM),
      start: 1675382400,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: 1675382400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1675382400,
    },
    [CHAIN.XDAI]: {
      fetch: fetch(CHAIN.XDAI),
      start: 1675382400,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1675382400,
    }
  }
}

export default adapter;
