import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi = {
  transferEvent: 'event Transfer(address indexed from, address indexed to, uint256 value)'
}
const WldTokenContract = {
  [CHAIN.WC.valueOf()]: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003',
}
const resolverAddresses = [
  '0x38Ce1e9845795cdA4e6C3373d3d458FaE11A17F3',
  '0xF26Eb487F1E108272346CBCEED0e30e18E4d88ce',
  '0xD8a59935ef87E0482ADf1104C076811a4C90c0c0',
  '0x9d17c08eA82Fe8e88D1727623CFec77b29aDD1Cf'
].map(address => address.toLowerCase())
const worldleContractAddresses = [
  '0xDD7F09089ECA6759232c0c088326Dc2cBC04971F',
  '0x03D6ec933E452283a0CaC468F487F327d1baE9ba'
].map(address => address.toLowerCase())
const BATCH_SIZE = 1000

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultV2> => {
  const target = WldTokenContract[chain] as `0x${string}`
  const dailyFees = createBalances()
  const [fromBlock, toBlock] = await Promise.all([
    getFromBlock(),
    getToBlock()
  ])
  let scanStartBlock = fromBlock
  while (scanStartBlock <= toBlock) {
    const scanEndBlock = Math.min(scanStartBlock + BATCH_SIZE, toBlock)
    const transferEvents = await getLogs({ target, eventAbi: abi.transferEvent, fromBlock: scanStartBlock, toBlock: scanEndBlock })
    transferEvents.forEach(transferEvent => {
      const from = transferEvent.from.toLowerCase()
      const to = transferEvent.to.toLowerCase()
      const value = transferEvent.value
      if (worldleContractAddresses.includes(from) && resolverAddresses.includes(to)) {
        dailyFees.add(target, value)
      }
    })
    scanStartBlock = scanEndBlock + 1
  }

  return { dailyFees, dailyRevenue: dailyFees }
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.WC]: {
            fetch,
            start: 1745060721,
            meta: {
                methodology: {
                  dailyFees: 'Fees are calculated as sum of all Transfer events to the royale resolver',
                  dailyRevenue: 'Revenue is the same as fees'
                },
            }
        },
    }
};

export default adapter;
