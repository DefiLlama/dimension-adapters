import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

// https://etherscan.io/tx/0x49aad1741e1c7bee650befb18d9c37266237e0021722d74cc00fc4dfa5d8c38c
const REVENUE_RATIO = 0.2; // 20% fees to revenue buy back and burn BNT tokens

async function fetch(fetchOptions: FetchOptions) {
  const { getLogs, createBalances, } = fetchOptions
  const contract = '0xeEF417e1D5CC832e619ae18D2F140De2999dD4fB'
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const logs = await getLogs({ targets: [contract], eventAbi: 'event TokensTraded(bytes32 indexed contextId, address indexed sourceToken, address indexed targetToken, uint256 sourceAmount, uint256 targetAmount, uint256 bntAmount, uint256 targetFeeAmount, uint256 bntFeeAmount, address trader)' })
  logs.forEach((log: any) => {
    dailyVolume.add(log.targetToken, log.targetAmount);
    dailyFees.add(log.targetToken, log.targetFeeAmount, METRIC.SWAP_FEES);
  })
  const dailyRevenue = dailyFees.clone(REVENUE_RATIO);
  const dailySupplySideRevenue = dailyFees.clone(1 - REVENUE_RATIO);
  const dailyHoldersRevenue = createBalances();
  dailyHoldersRevenue.add(dailyRevenue, METRIC.TOKEN_BUY_BACK);
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'Swap fees charged on trades in the target token.',
  SupplySideRevenue: 'There are 80% fees are distributed to LPs.',
  Revenue: 'There are 20% fees are collected as revenue.',
  ProtocolRevenue: 'No reveneu share to Bancor protocol.',
  HoldersRevenue: 'All revenue are used to buy back and burn vBNT tokens.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Fee charged on each swap, denominated in the target token of the trade.',
  },
  Revenue: {
    [METRIC.SWAP_FEES]: 'There are 20% fees are collected as revenue.',
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: 'There are 80% fees are distributed to LPs',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'All revenue are used to buy back and burn vBNT tokens.',
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  fetch,
  start: '2022-04-20',
  methodology,
  breakdownMethodology,
}

export default adapter;
