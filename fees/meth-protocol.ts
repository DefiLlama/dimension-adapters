import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";

// docs: https://docs.mantle.xyz/meth/components/smart-contracts/staking-meth
// source: https://github.com/mantle-lsp/contracts/tree/main/src
// Oracle pushes a validator balance record (~every 8h) and calls ReturnsAggregator.processReturns in the same tx,
// which takes feesBasisPoints (1000 = 10%) of withdrawn CL rewards + EL rewards: https://etherscan.io/address/0x1766be66fBb0a1883d41B4cfB0a533c5249D3b82#readProxyContract#F5
const Staking = '0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f'
const ReturnsAggregator = '0x1766be66fBb0a1883d41B4cfB0a533c5249D3b82'
const Oracle = '0x8735049F496727f824Cc0f2B174d826f5c408192'
// lends part of the staked ETH and tops up the interest to Staking minus its own feesBasisPoints (1000 = 10%)
const LiquidityBuffer = '0x006FaD88c35D973A87E451CF8D000c7e83Dad409'

const OracleRecord = '(uint64 updateStartBlock, uint64 updateEndBlock, uint64 currentNumValidatorsNotWithdrawable, uint64 cumulativeNumValidatorsWithdrawable, uint128 windowWithdrawnPrincipalAmount, uint128 windowWithdrawnRewardAmount, uint128 currentTotalValidatorBalance, uint128 cumulativeProcessedDepositAmount)'

const abis = {
  OracleRecordAdded: `event OracleRecordAdded(uint256 indexed index, ${OracleRecord} record)`,
  recordAt: `function recordAt(uint256 idx) view returns (${OracleRecord})`,
  FeesCollected: 'event FeesCollected(uint256 amount)',
  ReturnsReceived: 'event ReturnsReceived(uint256 amount)',
  InterestToppedUp: 'event InterestToppedUp(uint256 amount)',
}

const sumByTx = (logs: any[]) => {
  const byTx: Record<string, bigint> = {}
  for (const log of logs) byTx[log.transactionHash] = (byTx[log.transactionHash] ?? 0n) + BigInt(log.args.amount)
  return byTx
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [records, aggregatorFees, returnsToStaking, bufferFees, bufferInterest] = await Promise.all([
    options.getLogs({ target: Oracle, eventAbi: abis.OracleRecordAdded, onlyArgs: false }),
    options.getLogs({ target: ReturnsAggregator, eventAbi: abis.FeesCollected, onlyArgs: false }),
    options.getLogs({ target: Staking, eventAbi: abis.ReturnsReceived, onlyArgs: false }),
    options.getLogs({ target: LiquidityBuffer, eventAbi: abis.FeesCollected }),
    options.getLogs({ target: LiquidityBuffer, eventAbi: abis.InterestToppedUp }),
  ])

  if (records.length) {
    const feesBasisPoints = BigInt(await options.api.call({ target: ReturnsAggregator, abi: 'uint16:feesBasisPoints' }))
    const previousRecords = await options.api.multiCall({ target: Oracle, abi: abis.recordAt, calls: records.map((log: any) => (BigInt(log.args.index) - 1n).toString()) })
    const feesByTx = sumByTx(aggregatorFees)
    const returnsByTx = sumByTx(returnsToStaking)

    records.forEach((log: any, i: number) => {
      const record = log.args.record
      const previous = previousRecords[i]
      const withdrawnReward = BigInt(record.windowWithdrawnRewardAmount)
      const withdrawnPrincipal = BigInt(record.windowWithdrawnPrincipalAmount)

      const clRewards = BigInt(record.currentTotalValidatorBalance) - BigInt(previous.currentTotalValidatorBalance)
        - (BigInt(record.cumulativeProcessedDepositAmount) - BigInt(previous.cumulativeProcessedDepositAmount))
        + withdrawnReward + withdrawnPrincipal

      const tx = log.transactionHash
      const elRewards = (returnsByTx[tx] ?? 0n) + (feesByTx[tx] ?? 0n) - withdrawnReward - withdrawnPrincipal

      const clFees = clRewards * feesBasisPoints / 10000n
      const elFees = elRewards * feesBasisPoints / 10000n

      dailyFees.addGasToken(clRewards, METRIC.STAKING_REWARDS)
      dailyRevenue.addGasToken(clFees, METRIC.STAKING_REWARDS)
      dailySupplySideRevenue.addGasToken(clRewards - clFees, METRIC.STAKING_REWARDS)

      dailyFees.addGasToken(elRewards, METRIC.MEV_REWARDS)
      dailyRevenue.addGasToken(elFees, METRIC.MEV_REWARDS)
      dailySupplySideRevenue.addGasToken(elRewards - elFees, METRIC.MEV_REWARDS)
    })
  }

  for (const log of bufferFees) {
    dailyFees.addGasToken(log.amount, METRIC.ASSETS_YIELDS)
    dailyRevenue.addGasToken(log.amount, METRIC.ASSETS_YIELDS)
  }
  for (const log of bufferInterest) {
    dailyFees.addGasToken(log.amount, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.addGasToken(log.amount, METRIC.ASSETS_YIELDS)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  }
}

const adapter: Adapter = {
  pullHourly: true,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-07',
    },
  },
  methodology: {
    Fees: 'Total consensus layer rewards, execution layer (MEV and priority fee) rewards from staked ETH, and interest earned by the liquidity buffer. Excludes ETH topped up by Mantle to boost the mETH rate.',
    Revenue: '10% of staking rewards and liquidity buffer interest, charged by the mETH Protocol Treasury.',
    SupplySideRevenue: '90% of staking rewards and liquidity buffer interest, distributed to mETH holders.',
    ProtocolRevenue: '10% of staking rewards and liquidity buffer interest, charged by the mETH Protocol Treasury.',
    HoldersRevenue: 'No revenue share to COOK token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
      [METRIC.ASSETS_YIELDS]: 'Interest earned by lending part of the staked ETH through the liquidity buffer.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Mantle.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Mantle.',
      [METRIC.ASSETS_YIELDS]: 'Share of liquidity buffer interest to Mantle.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Mantle.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Mantle.',
      [METRIC.ASSETS_YIELDS]: 'Share of liquidity buffer interest to Mantle.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to stakers.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
      [METRIC.ASSETS_YIELDS]: 'Share of liquidity buffer interest to stakers.',
    },
  },
  // validator balances can drop between two oracle records (penalties, slashing), booked as negative staking rewards
  allowNegativeValue: true,
};

export default adapter;
