import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { request } from "graphql-request";

// count minter fees on MintExecuted transactions
// count penalty fees on MissedIntervalsPenaltyImposed transactions
// count holder revenue on M Distribution transactions to approved earning M stakers
// count collateral treasuries earning as supply side revenue
const methodology = {
  Fees: 'Total minter fees and penalty fees paid by borrowers.',
  Revenue: 'Total fees are earned by M0 protocol and distibuted to whitelised M staker',
  SupplySideRevenue: 'Total yields are earning from off-chain deposited collaterals',
  HoldersRevenue: 'Total fees are distibuted to whitelised M staker',
  ProtocolRevenue: 'Total fees are earned by M0 protocol',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Treasury yields earned from collateral assets.',
    [METRIC.MINT_REDEEM_FEES]: 'Fees earned from mint/redeem M0 tokens, and penalty fees charged.',
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Fees earned from mint/redeem M0 tokens, and penalty fees charged.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Treasury yields earned from collateral assets',
  },
  HoldersRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Treasury yields earned from collateral assets and distibuted to whitelised M stakers.',
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Fees earned from mint/redeem M0 tokens, and penalty fees charged.',
  },
}

const TokenM = '0x866a2bf4e572cbcf37d5071a7a58503bfb36be1b'
const MinterGateway = '0xf7f9638cb444D65e5A40bF5ff98ebE4ff319F04E'

const Earners: Array<string> = [
  '0x437cc33344a0B27A429f795ff6B469C72698B291',
  '0x83Ae82Bd4054e815fB7B189C39D9CE670369ea16',
  '0x0502d65f26f45d17503E4d34441F5e73Ea143033',
  '0x846E7F810E08F1E2AF2c5AfD06847cc95F5CaE1B',
  '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd',
]

const ContractAbis = {
  totalSupply: 'uint256:totalSupply',
  balanceOf: 'function balanceOf(address) view returns (uint256)',
  MintExecuted: 'event MintExecuted(uint48 indexed mintId, address indexed minter, uint112 principalAmount, uint240 amount)',
  MissedIntervalsPenaltyImposed: 'event MissedIntervalsPenaltyImposed(address indexed minter, uint40 missedIntervals, uint240 penaltyAmount)',
}

// we can not query supply side fees on-chain
// we must query it from M0 subgraph
const subgraph = () => 'https://protocol-api.m0.org/graphql'
const query = () => `
  query GetCollateralData($date: String!) {
    CollateralCurrent(date: $date) {
      yieldToMaturity
      eligibleTreasuries
    }
  }
`

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // calculate amount of earning by approved earning M holders
  const balances = await options.api.multiCall({
    abi: ContractAbis.balanceOf,
    calls: Earners.map(address => {
      return {
        target: TokenM,
        params: [address]
      }
    })
  });
  const totalSupply = await options.api.call({
    abi: ContractAbis.totalSupply,
    target: TokenM,
  })
  let totalEarnerBalance = 0
  for (const balance of balances) {
    totalEarnerBalance += Number(balance)
  }
  const earnerRate = totalEarnerBalance / Number(totalSupply)

  const MintExecutedEvents: Array<any> = await options.getLogs({
    eventAbi: ContractAbis.MintExecuted,
    target: MinterGateway,
  })
  const MissedIntervalsPenaltyImposedEvents: Array<any> = await options.getLogs({
    eventAbi: ContractAbis.MissedIntervalsPenaltyImposed,
    target: MinterGateway,
  })

  for (const event of MintExecutedEvents) {
    // MinterGateway track mint rate by an index number
    // it reduces amount of fee right after the minting was executed
    const feeAmount = Number(event.amount) - Number(event.principalAmount)
    dailyFees.add(TokenM, feeAmount, METRIC.MINT_REDEEM_FEES)
    dailyHoldersRevenue.add(TokenM, feeAmount * earnerRate, METRIC.MINT_REDEEM_FEES)
  }
  for (const event of MissedIntervalsPenaltyImposedEvents) {
    dailyFees.add(TokenM, Number(event.penaltyAmount), METRIC.MINT_REDEEM_FEES)
  }

  const dailyProtocolRevenue = dailyFees.clone()
  dailyProtocolRevenue.subtract(dailyHoldersRevenue)

  const dateString = new Date(options.startTimestamp * 1000).toISOString().split('T')[0]
  const response = await request(subgraph(), query(), {
    date: dateString,
  })
  if (response.CollateralCurrent) {
    const totalBalance = Number(response.CollateralCurrent.eligibleTreasuries)
    const yieldRate = Number(response.CollateralCurrent.yieldToMaturity)
  
    const YEAR = 365 * 24 * 60 * 60
    const timeframe = options.fromTimestamp && options.toTimestamp ? (options.toTimestamp - options.fromTimestamp) : 24 * 60 * 60
    const totalYield = totalBalance * yieldRate * timeframe / YEAR

    dailyFees.add(TokenM, totalYield, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.add(TokenM, totalYield, METRIC.ASSETS_YIELDS)
  }

  const dailyRevenue = dailyHoldersRevenue.clone(1)
  dailyRevenue.addBalances(dailySupplySideRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-05-31',
    },
  },
  methodology,
  breakdownMethodology,
  version: 2,
};

export default adapter;
