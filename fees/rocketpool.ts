import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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
  Revenue: "Rocket Pool protocol doesn't take any fees or rewards cut.",
  SupplySideRevenue: 'Total ETH staking rewards are distributed to rETH stakers and minipool depositors.',
}

const rETH = ADDRESSES.ethereum.RETH;

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
  etherAmount: number;
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
        etherAmount: Number(log.amount),
        fromAddress: log.from.toLowerCase(),
      }
      return event
    })

  // we make sure minipools addresses are unique to reduce contract calls
  const minipools: {
    [key: string]: {
      nodeBalance: null | number;
      nodeFee: null | number;
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
    minipools[minipoolAddresses[i]].nodeBalance = getNodeBalances[i] ? +getNodeBalances[i] : null
    minipools[minipoolAddresses[i]].nodeFee = getNodeFees[i] ? +getNodeFees[i] : null
  }

  for (const event of etherDepositedEvents) {
    const nodeBalance = minipools[event.fromAddress].nodeBalance
    let nodeFeeRate = minipools[event.fromAddress].nodeFee
    // if nodeBalance is null, it means the minipool is not active
    if (nodeBalance === null || nodeFeeRate === null) {
      continue
    }
    nodeFeeRate = nodeFeeRate / 1e18

    // make sure the deposit from minipools
    let rewardToStakers = 0

    if (event.etherAmount >= 24e18) {
      // minipools repay borrowed 24 ETH to rETH, and the rest amount is rewards
      rewardToStakers = event.etherAmount - 24e18
    } else if (event.etherAmount >= 16e18 && event.etherAmount < 24e18) {
      // minipools repay borrowed 16 ETH to rETH, and the rest amount is rewards
      rewardToStakers = event.etherAmount - 16e18
    } else {
      // minipools distribute rewards
      rewardToStakers = event.etherAmount
    }

    // calculate total rewards were collected by minipool (excluding minipool commission)
    const rewardToStakersAndOperators = rewardToStakers / (1 - (nodeBalance / 32e18))

    // calculate total rewards were collected by minipool (including minipool commission)
    const rewardFromBeacon = rewardToStakersAndOperators / (1 - nodeFeeRate)


    dailyFees.addGasToken(rewardFromBeacon)
  }

  const etherWithdrawnEvents: Array<any> = (await options.getLogs({
    target: smoothingPool,
    eventAbi: RocketPoolContractAbis.smoothingPoolEtherWithdrawn,
  }))
  etherWithdrawnEvents.forEach((log: any) => {
    if (log.to.toLowerCase() === rETH.toLowerCase()) {
      dailyFees.addGasToken(log.amount)
    }
  })

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2021-09-31',
    },
  },
  methodology,
};

export default adapter;
