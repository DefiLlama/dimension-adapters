import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type TMarketPlaceAddress = {
  [l: string | CHAIN]: string;
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

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const logs = await getLogs({
    target: marketplace_address[chain],
    eventAbi: 'event Deposit (address indexed account, address indexed erc20, uint256 amount)'
  });
  logs.forEach((e: any) => {
    dailyFees.add(e.erc20, e.amount, METRIC.SERVICE_FEES)
    dailyRevenue.add(e.erc20, e.amount, METRIC.SERVICE_FEES)
  })
  return { dailyFees, dailyRevenue };
}

const methodology = {
  Fees: "Fees paid by users for using RPC services.",
  Revenue: "All fees are revenue.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: 'Token deposits made by users to the BlastAPI marketplace contract for RPC service access.',
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: 'All user deposits for RPC services are recognized as protocol revenue.',
  },
}

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-02-03', },
    [CHAIN.BSC]: { start: '2023-02-03', },
    [CHAIN.AVAX]: { start: '2023-02-03', },
    [CHAIN.MOONBEAM]: { start: '2023-02-03', },
    [CHAIN.FANTOM]: { start: '2023-02-03', },
    [CHAIN.POLYGON]: { start: '2023-02-03', },
    [CHAIN.XDAI]: { start: '2023-02-03', },
    [CHAIN.OPTIMISM]: { start: '2023-02-03', },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
