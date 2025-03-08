import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VotingEscrows = {
    USD: "0x0966CAE7338518961c2d35493D3EB481A75bb86B",
    ETH: "0x1Ec2b9a77A7226ACD457954820197F89B3E3a578",
    BTC: "0x7585D9C32Db1528cEAE4770Fd1d01B888F5afA9e"
};

const fetch: any = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyFees = createBalances();
  const ves = Object.values(VotingEscrows)
  const voters = await api.multiCall({  abi: 'address:voter', calls: ves})
  const baseAssets = await api.multiCall({  abi: 'address:baseAsset', calls: voters})
  const logs = await getLogs({
    targets: voters,
    flatten: false,
    eventAbi: "event BudgetDeposited(address indexed depositor, uint256 indexed period, uint256 amount)",
  });

  logs.forEach((log, i) => {
    const asset = baseAssets[i]
    log.map(i => dailyFees.add(asset, i.amount))
  })

  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-01-21',
      meta: {
        methodology: 'We calculate the fees added to the voters of each ve contracts',
      }
    },
  },
};

export default adapter;
