import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ZeroAddress } from "ethers";
import { normalizeAddress } from "@defillama/sdk/build/util";

/**
 * 
 * There are two main actors in rocketpool system: stakers and node operators
 * 
 * Stakers stake any amount of ETH into rETH - these ETH will be borrowed and staking into the Beacon chain by node operators
 * Node operators open minipools by stake atleast 8 or 16 ETH and must borrow 24 or 16 ETH from rETH and operate a validator on the Beacon chain
 * 
 * When node operators earn ETH rewards from Beacon chain, they earn 5%-14% commission
 * And node operators distribute remaining ETH rewards amount to rETH stakers
 * 
 * Here is an example scenario:
 * 
 * Node A open open a minipool of 8 ETH and with a commission of 5%, it need to borrow 24 ETH from rETH
 * Node A then stakes all 32 ETH and become a active validator on the Beacon chain
 * Node A earns 0.5 ETH rewards from Beacon chain and will distribute as follow:
 * - Total 5% of 0.5 ETH (0.025) earned by Node A as commission
 * - Node A also earned 25% if remaining 0.475 ETH from initial 8 ETH staking in minipool
 * - Node A distributes all remaing of 75% of 0.475 ETH to rETh stakers
 * 
 * As descrive above, total fees on Rocketpool are distributed to supply side stakers and minipools operators.
 * The Rocket Pool protocol matches liquid stakers with node operators. It does not take a fee for providing this service.
 */

const methodology = {
  Fees: 'Total ETH staking rewards from Rocketpool active validators',
  SupplySideRevenue: 'Total ETH staking rewards are distributed to rETH stakers and minipool depositors.',
}

const rETH = '0xae78736cd615f374d3085123a210448e74fc6393';

// MEV and priority fees send to smoothing pool by block builders
const smoothingPool = '0xd4E96eF8eee8678dBFf4d535E033Ed1a4F7605b7';

const RocketPoolContractAbis = {
  rETHEventEtherDeposited: 'event EtherDeposited(address indexed from, uint256 amount, uint256 time)',

  // count ETH withdrawn from smoothing pool as collected fees
  smoothingPoolEtherWithdrawn: 'event EtherWithdrawn(string indexed by, address indexed to, uint256 amount, uint256 time)',

  // these call target to RocketMinipool
  // but abi from RocketMinipoolDelegate
  // https://etherscan.io/address/0xA347C391bc8f740CAbA37672157c8aAcD08Ac567#code
  minipoolGetNodeFee: 'function getNodeFee() view returns (uint256)',
  minipoolGetNodeDepositBalance: 'function getNodeDepositBalance() view returns (uint256)',
}

interface EtherDepositedEvent {
  etherAmount: bigint;
  fromAddress: string;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()

  const etherDepositedEvents: Array<EtherDepositedEvent> = (await options.getLogs({
    target: rETH,
    eventAbi: RocketPoolContractAbis.rETHEventEtherDeposited,
  }))
    .map((log: any) => {
      const event: EtherDepositedEvent = {
        etherAmount: BigInt(log[1].toString()),
        fromAddress: normalizeAddress(log[0].toString()),
      }
      return event
    })

  // we make sure minipools addresses are unique to reduce contract calls
  const minipools: {
    [key: string]: {
      nodeBalance: null | bigint;
      nodeFee: null | bigint;
    }
  } = {};
  for (const event of etherDepositedEvents) {
    minipools[event.fromAddress] = {
      nodeBalance: null,
      nodeFee: null,
    }
  }

  const minipoolAddresses = Object.keys(minipools);
  const getNodeBalances = await options.api.multiCall({
    abi: RocketPoolContractAbis.minipoolGetNodeDepositBalance,
    calls: minipoolAddresses,
    permitFailure: true,
  })
  const getNodeFees = await options.api.multiCall({
    abi: RocketPoolContractAbis.minipoolGetNodeFee,
    calls: minipoolAddresses,
    permitFailure: true,
  })
  for (let i = 0; i < minipoolAddresses.length; i++) {
    minipools[minipoolAddresses[i]].nodeBalance = getNodeBalances[i] ? BigInt(getNodeBalances[i].toString()) : null
    minipools[minipoolAddresses[i]].nodeFee = getNodeFees[i] ? BigInt(getNodeFees[i].toString()) : null
  }

  for (const event of etherDepositedEvents) {
    const nodeBalance = minipools[event.fromAddress].nodeBalance
    const nodeFeeRate = minipools[event.fromAddress].nodeFee

    // make sure the deposit from minipools
    if (nodeBalance !== null && nodeFeeRate !== null) {
      let rewardToStakers = BigInt(0)

      if (event.etherAmount >= BigInt(24e18)) {
        // minipools repay borrowed 24 ETH to rETH, and the rest amount is rewards
        rewardToStakers = event.etherAmount - BigInt(24e18)
      } else if (event.etherAmount >= BigInt(16e18) && event.etherAmount < BigInt(24e18)) {
        // minipools repay borrowed 16 ETH to rETH, and the rest amount is rewards
        rewardToStakers = event.etherAmount - BigInt(16e18)
      } else {
        // minipools distribute rewards
        rewardToStakers = event.etherAmount
      }

      // calculate total rewards were collected by minipool (excluding minipool commission)
      const rewardToStakersAndOperators = rewardToStakers * BigInt(1e18) / (BigInt(1e18) - (nodeBalance * BigInt(1e18) / BigInt(32e18)))
      
      // calculate total rewards were collected by minipool (including minipool commission)
      const rewardFromBeacon = rewardToStakersAndOperators * BigInt(1e18) / (BigInt(1e18) - nodeFeeRate)

      dailyFees.add(ZeroAddress, rewardFromBeacon)
    }
  }

  const etherWithdrawnEvents: Array<any> = (await options.getLogs({
    target: smoothingPool,
    eventAbi: RocketPoolContractAbis.smoothingPoolEtherWithdrawn,
  }))
  etherWithdrawnEvents.forEach((log: any) => {
    if (log[1].toString().toLowerCase() === rETH.toLowerCase()) {
      dailyFees.add(ZeroAddress, BigInt(log[2].toString()))
    }
  })

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2021-09-31',
      meta: {
        methodology,
      }
    },
  },
};

export default adapter;
