import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from '../helpers/metrics';

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
 * The Rocket Pool protocol matches liquid stakers with node operators. Minipools pay it no fee for this service.
 * Since Saturn 1, megapool rewards also carve out a voter share, paid to RPL stakers, and a protocol DAO share.
 */

const rETH = ADDRESSES.ethereum.RETH;

// MEV and priority fees send to smoothing pool by block builders
const smoothingPool = '0xd4E96eF8eee8678dBFf4d535E033Ed1a4F7605b7';

const LABELS = {
  VOTER_SHARE: 'Staking Rewards To RPL Stakers',
  PDAO_SHARE: 'Staking Rewards To Protocol DAO',
}

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
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

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

    dailyFees.addGasToken(rewardFromBeacon, METRIC.STAKING_REWARDS)
    dailySupplySideRevenue.addGasToken(rewardFromBeacon, METRIC.STAKING_REWARDS)
  }

  // Since Saturn 1, node operators can run megapools instead of minipools.
  // Megapools deposit their rETH reward share through the same EtherDeposited
  // event, but do not implement getNodeDepositBalance/getNodeFee, so they
  // revert above and are skipped by the minipool loop. Pick them up from their
  // own RewardsDistributed event. The node leg is defined on-chain as the
  // residual (nodeAmount = reward - the other three legs), so the four legs sum
  // exactly to the full pre-split beacon reward - the megapool analogue of the
  // minipool rewardFromBeacon above, with no bond/commission gross-up needed.
  const rocketStorage = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46';
  const megapoolExistsKeys = minipoolAddresses.map((address) =>
    ethers.solidityPackedKeccak256(['string', 'address'], ['megapool.exists', address])
  );
  // getBool returns false for an unset key and never reverts, so unlike the
  // minipool getters above it needs no permitFailure - letting a genuine RPC
  // failure throw is preferable to silently dropping a megapool's rewards.
  const isMegapool = await options.api.multiCall({
    abi: 'function getBool(bytes32) view returns (bool)',
    calls: megapoolExistsKeys.map((key) => ({ target: rocketStorage, params: [key] })),
  })
  // Scope RewardsDistributed to confirmed megapool emitters. Its topic0 is a
  // plain five-uint256 signature that unrelated contracts also emit, so an
  // unscoped scan would overcount; the EtherDeposited senders are the natural,
  // already-collected candidate set.
  const megapoolAddresses = minipoolAddresses.filter((_, i) => isMegapool[i] === true)
  if (megapoolAddresses.length > 0) {
    const rewardsDistributedLogs = await options.getLogs({
      targets: megapoolAddresses,
      eventAbi: 'event RewardsDistributed(uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount, uint256 protocolDaoAmount, uint256 time)',
    })
    for (const log of rewardsDistributedLogs) {
      // The full beacon reward is counted as fees. The node and rETH legs are
      // supply side, like the minipool path above. Saturn 1 also carves out a
      // voter share, paid to RPL stakers, and a protocol-DAO share, so those
      // two legs are revenue.
      const beaconReward = Number(log.nodeAmount) + Number(log.voterAmount) + Number(log.rethAmount) + Number(log.protocolDaoAmount)
      dailyFees.addGasToken(beaconReward, METRIC.STAKING_REWARDS)
      dailySupplySideRevenue.addGasToken(Number(log.nodeAmount) + Number(log.rethAmount), METRIC.STAKING_REWARDS)
      dailyRevenue.addGasToken(Number(log.voterAmount), LABELS.VOTER_SHARE)
      dailyRevenue.addGasToken(Number(log.protocolDaoAmount), LABELS.PDAO_SHARE)
      dailyHoldersRevenue.addGasToken(Number(log.voterAmount), LABELS.VOTER_SHARE)
      dailyProtocolRevenue.addGasToken(Number(log.protocolDaoAmount), LABELS.PDAO_SHARE)
    }
  }

  // MEV and execution rewards
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [smoothingPool],
    from_block: Number(await options.getFromBlock()),
    to_block: Number(options.toApi.block),
  })
  if (transactions) {
    for (const tx of transactions) {
      dailyFees.addGasToken(tx.value, METRIC.MEV_REWARDS)
      dailySupplySideRevenue.addGasToken(tx.value, METRIC.MEV_REWARDS)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2021-09-30',
    },
  },
  methodology: {
    Fees: 'Total ETH staking rewards from Rocketpool active validators',
    Revenue: 'The voter share (paid to RPL stakers) and protocol DAO share of megapool rewards, since the first megapool distribution on 2026-06-21. Minipools pay no protocol cut, so revenue was 0 before.',
    ProtocolRevenue: 'The protocol DAO share of megapool rewards, set by governance (0% so far).',
    HoldersRevenue: 'The voter share of megapool rewards, paid to RPL stakers through the rewards pool, since 2026-06-21.',
    SupplySideRevenue: 'ETH staking rewards distributed to rETH stakers and node operators (minipools and the node and rETH shares of megapools).',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
    },
    Revenue: {
      [LABELS.VOTER_SHARE]: 'Voter share of megapool rewards, paid to RPL stakers.',
      [LABELS.PDAO_SHARE]: 'Protocol DAO share of megapool rewards.',
    },
    ProtocolRevenue: {
      [LABELS.PDAO_SHARE]: 'Protocol DAO share of megapool rewards.',
    },
    HoldersRevenue: {
      [LABELS.VOTER_SHARE]: 'Voter share of megapool rewards, paid to RPL stakers.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to rETH stakers and node operators.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to rETH stakers and minipool depositors.',
    },
  }
};

export default adapter;
