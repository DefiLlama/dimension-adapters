import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";


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
  return async ({ createBalances, getLogs, }: FetchOptions) => {
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const logs = await getLogs({
      target: marketplace_address[chain],
      eventAbi: 'event Deposit (address indexed account, address indexed erc20, uint256 amount)'
    });
    logs.forEach((e: any) => {
      dailyFees.add(e.erc20, e.amount, 'RPC Service Deposits')
      dailyRevenue.add(e.erc20, e.amount, 'RPC Service Revenue')
    })
    return { dailyFees, dailyRevenue };
  }
}

const methodology = {
  Fees: "Fees paid by users for using RPC services.",
  Revenue: "All fees are revenue.",
}

const breakdownMethodology = {
  Fees: {
    'RPC Service Deposits': 'Token deposits made by users to the BlastAPI marketplace contract for RPC service access.',
  },
  Revenue: {
    'RPC Service Revenue': 'All user deposits for RPC services are recognized as protocol revenue.',
  },
}

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: '2023-02-03',
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: '2023-02-03',
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: '2023-02-03',
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetch(CHAIN.MOONBEAM),
      start: '2023-02-03',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: '2023-02-03',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: '2023-02-03',
    },
    [CHAIN.XDAI]: {
      fetch: fetch(CHAIN.XDAI),
      start: '2023-02-03',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-02-03',
    }
  }
}

export default adapter;
