import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"
import ADDRESSES from '../helpers/coreAssets.json'

const reth2Address = '0x20bc832ca081b91433ff6c17f85701b6e92486c5';
const osTokenCtrlEthereum = '0x2A261e60FB14586B474C208b1B7AC6D0f5000306';
const osTokenCtrlGnosis = '0x60B2053d7f2a0bBa70fe6CDd88FB47b579B9179a';

const STATE_UPDATED_EVENT = 'event StateUpdated(uint256 profitAccrued,uint256 treasuryShares,uint256 treasuryAssets)';

const fetchEthereum = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  let logs = await options.getLogs({
    target: reth2Address,
    eventAbi: 'event RewardsUpdated(uint256 periodRewards,uint256 totalRewards,uint256 rewardPerToken,uint256 distributorReward,uint256 protocolReward)'
  })
  for (const log of logs) {
    const periodRewards = Number(log.periodRewards)
    const protocolReward = Number(log.protocolReward)
    dailyFees.addGasToken(periodRewards, METRIC.STAKING_REWARDS)
    dailyRevenue.addGasToken(protocolReward, METRIC.PERFORMANCE_FEES)
    dailySupplySideRevenue.addGasToken(periodRewards - protocolReward, METRIC.STAKING_REWARDS)
  }

  logs = await options.getLogs({
    target: osTokenCtrlEthereum,
    eventAbi: STATE_UPDATED_EVENT,
  })
  for (const log of logs) {
    const profitAccrued = Number(log.profitAccrued)
    const treasuryAssets = Number(log.treasuryAssets)
    dailyFees.addGasToken(profitAccrued, METRIC.STAKING_REWARDS)
    dailyRevenue.addGasToken(treasuryAssets, METRIC.PERFORMANCE_FEES)
    dailySupplySideRevenue.addGasToken(profitAccrued - treasuryAssets, METRIC.STAKING_REWARDS)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const fetchGnosis = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({
    target: osTokenCtrlGnosis,
    eventAbi: STATE_UPDATED_EVENT,
  })
  for (const log of logs) {
    const profitAccrued = Number(log.profitAccrued)
    const treasuryAssets = Number(log.treasuryAssets)
    dailyFees.addToken(ADDRESSES.xdai.GNO, profitAccrued, METRIC.STAKING_REWARDS)
    dailyRevenue.addToken(ADDRESSES.xdai.GNO, treasuryAssets, METRIC.PERFORMANCE_FEES)
    dailySupplySideRevenue.addToken(ADDRESSES.xdai.GNO, profitAccrued - treasuryAssets, METRIC.STAKING_REWARDS)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Fees: 'Total staking rewards collected from rETH2, osETH and osGNO vaults.',
  Revenue: 'Protocol fee on staking rewards, taken as a configurable percentage set per deployment (currently ~5% on osETH/osGNO, ~10% on rETH2).',
  ProtocolRevenue: 'Protocol fee on staking rewards, taken as a configurable percentage set per deployment (currently ~5% on osETH/osGNO, ~10% on rETH2).',
  SupplySideRevenue: 'Staking rewards distributed to stakers after the protocol fee.',
  HoldersRevenue: 'No revenue share to SWISE token holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Staking rewards earned by rETH2, osETH and osGNO vault validators.',
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: 'Protocol fee deducted from staking rewards, as configured per deployment.',
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: 'Protocol fee deducted from staking rewards, as configured per deployment.',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'Staking rewards distributed to rETH2, osETH and osGNO holders after the protocol fee.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: '2022-01-04'
    },
    [CHAIN.XDAI]: {
      fetch: fetchGnosis,
      start: '2024-07-04'
    },
  }
}

export default adapter;
