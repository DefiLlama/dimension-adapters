import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ethers } from "ethers";

const BRIDGE = '0x5e4861a80B55f035D899f66772117F00FA0E8e7B'
const BANK = '0x65Fbae61ad2C8836fFbFB502A0dA41b0789D9Fc6'
const SATOSHI_MULTIPLIER = 10n ** 10n

const eventBalanceIncreased = 'event BalanceIncreased(address indexed owner,uint256 amount)'
const eventBalanceTransferred = 'event BalanceTransferred(address indexed from,address indexed to,uint256 amount)'
const eventTreasuryUpdated = 'event TreasuryUpdated(address treasury)'

const topicBalanceIncreased = ethers.id('BalanceIncreased(address,uint256)')
const topicBalanceTransferred = ethers.id('BalanceTransferred(address,address,uint256)')
const topicTreasuryUpdated = ethers.id('TreasuryUpdated(address)')

const padAddress = (address: string) => ethers.zeroPadValue(address, 32)
const normalizeAddress = (address: string) => address.toLowerCase()
const toBigInt = (amount: any) => BigInt(amount.toString())

const getTreasuryAddresses = async (options: FetchOptions) => {
  const [startTreasury, endTreasury, treasuryUpdateLogs] = await Promise.all([
    options.fromApi.call({ target: BRIDGE, abi: 'address:treasury' }),
    options.toApi.call({ target: BRIDGE, abi: 'address:treasury' }),
    options.getLogs({
      target: BRIDGE,
      eventAbi: eventTreasuryUpdated,
      topics: [topicTreasuryUpdated],
    }),
  ])

  const treasuries = new Set<string>([
    normalizeAddress(startTreasury),
    normalizeAddress(endTreasury),
  ])

  treasuryUpdateLogs.forEach((log: any) => {
    treasuries.add(normalizeAddress(log.treasury))
  })

  return Array.from(treasuries)
}

const fetch = async (options: FetchOptions) => {
  const treasuryAddresses = await getTreasuryAddresses(options)
  const logSets = await Promise.all(
    treasuryAddresses.map((treasury) =>
      Promise.all([
        options.getLogs({
          target: BANK,
          eventAbi: eventBalanceIncreased,
          topics: [topicBalanceIncreased, padAddress(treasury)],
        }),
        options.getLogs({
          target: BANK,
          eventAbi: eventBalanceTransferred,
          topics: [
            topicBalanceTransferred,
            padAddress(BRIDGE),
            padAddress(treasury),
          ],
        }),
      ])
    )
  )

  const dailyFees = options.createBalances()
  logSets.flat(2).forEach((log: any) => {
    dailyFees.add(
      ADDRESSES.ethereum.tBTC,
      toBigInt(log.amount) * SATOSHI_MULTIPLIER,
      METRIC.MINT_REDEEM_FEES
    )
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "tBTC treasury fees from minting and redemptions, tracked from Bank balance movements to the Bridge treasury. These movements contain the post-rebate amounts, so RebateStaking reductions are excluded.",
  UserFees: "Same as fees; treasury fees from minting and redemptions.",
  Revenue: "All tBTC treasury fees paid by minting and redemptions are protocol revenue.",
  ProtocolRevenue: "All tBTC treasury fees paid by minting and redemptions are protocol revenue.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "tBTC treasury fees from minting and redemptions, tracked from Bank balance movements to the Bridge treasury. These movements contain the post-rebate amounts, so RebateStaking reductions are excluded.",
  },
}


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-01-23',
    }
  },
  methodology,
  breakdownMethodology,
}
export default adapter;
