import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VotingEscrows = {
  USD: "0x0966CAE7338518961c2d35493D3EB481A75bb86B",
  ETH: "0x1Ec2b9a77A7226ACD457954820197F89B3E3a578",
  BTC: "0x7585D9C32Db1528cEAE4770Fd1d01B888F5afA9e"
};

const accountants = Object.values({
  USD: '0x13cCc810DfaA6B71957F2b87060aFE17e6EB8034',
  ETH: '0x61bE1eC20dfE0197c27B80bA0f7fcdb1a6B236E2'
})

const fetch: any = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyFees = createBalances();
  const ves = Object.values(VotingEscrows)
  const voters = await api.multiCall({ abi: 'address:voter', calls: ves })
  const baseAssets = await api.multiCall({ abi: 'address:baseAsset', calls: voters })

  // Budget event is yield generated from scUSD and scETH: comes from strategies in Ethereum veda vault
  const logs = await getLogs({
    targets: voters,
    flatten: false,
    eventAbi: "event BudgetDeposited(address indexed depositor, uint256 indexed period, uint256 amount)",
  });

  // rings dev: rehypothecation, scUSD is on Beets; Curve, Euler, Silo farming
  const accountantsLogs = await getLogs({
    targets: accountants,
    eventAbi: 'event YieldClaimed(address indexed yieldAsset, uint256 amount)',
  })

  accountantsLogs.forEach(log => {
    dailyFees.add(log.yieldAsset, log.amount)
  })

  logs.forEach((log, i) => {
    const asset = baseAssets[i]
    log.map(i => dailyFees.add(asset, i.amount))
  })

  return { dailyFees, };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-01-21',
    },
  },
};

export default adapter;
