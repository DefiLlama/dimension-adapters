/**
 * Echo Protocol Fee Adapter
 * 
 * Note on duplicate transactions: 
 * In v1/v2 factory contracts, deals often sent both deal funds and platform fees
 * to the fee receiver address in the same transaction. This created duplicate logs
 * that would artificially inflate fee calculations. To handle this, we track unique
 * transactions by combining address, transaction hash, and token as a key, and for
 * any duplicates we only count the transaction with the smallest amount (which 
 * represents the actual platform fee, not the deal funds).
 * 
 */

import { ethers } from "ethers"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

// Echo protocol contract addresses
const ECHO_v1_DEAL_FACTORY = '0x32885c0174FBd53A3BDf418408415c7bEF679810'
const ECHO_v2_DEAL_FACTORY = '0x31a85750a7fd18b598e1bc6dc5561ad1ef694fc4'
const ECHO_v3_DEAL_FACTORY = '0xB6D2c5dc2d181E0E1D031F2b3B76Ea8b678EAA46'

const ECHO_FEE_RECEIVER = '0x395426cE9081aE5ceA3f9fBA3078B00f16E7aE21'
const DEAL_FUNDS_WITHDRAWN_TOPIC = "0x7e63be7447cb592fc5a80b0ca7ceb813b777d8aa50ec5c00b89578b892b4b8e9"

const fetchFees = async (options: FetchOptions) => {
  const fromBlock = await options.getBlock(options.fromTimestamp, options.chain, {})
  const toBlock = await options.getBlock(options.toTimestamp, options.chain, {})
  // const fromBlock = 15111743
  // const toBlock = 28654931

  const logs = await options.getLogs({
    eventAbi: "event DealFundsWithdrawn (address indexed token, address indexed to, uint256 amount)",
    topics: [DEAL_FUNDS_WITHDRAWN_TOPIC, null as any, ethers.zeroPadValue(ECHO_FEE_RECEIVER, 32)],
    fromBlock,
    toBlock,
    entireLog: true,
    skipIndexer: true,
    noTarget: true,
  })

  const uniqueFees = new Map<string, { token: string, amount: bigint }>();

  // Process each log, keeping only the platform fee portion
  for (const log of logs) {
    const token = '0x' + log.topics[1].slice(26);
    const amount = BigInt(log.data);
    const key = `${log.address.toLowerCase()}_${log.transactionHash.toLowerCase()}_${token}`;
    if (!uniqueFees.has(key) || amount < uniqueFees.get(key)!.amount) {
      uniqueFees.set(key, { token, amount });
    }
  }

  const dailyFees = options.createBalances();
  for (const { token, amount } of uniqueFees.values()) {
    dailyFees.add(token, amount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-03-27',
    }
  },
  methodology: {
    Fees: "Platform fees collected by Echo protocol from each deal",
    Revenue: "Platform fees collected by Echo protocol from each deal",
  }
}

export default adapter
