import { Balances, ChainApi } from '@defillama/sdk'
import BigNumber from 'bignumber.js'
import { FetchOptions } from '../../adapters/types'
import { GearboxAbis, IGearboxService } from './configs'
import { getGearboxPools, getDaoTreasury } from './discovery'

const YEAR = 365 * 86400
const BPS = 10000
const lower = (address: string) => address.toLowerCase()
const bn = (value: BigNumber.Value) => new BigNumber(value)
const splitABI = '(bool initialized,address[] receivers,uint16[] proportions)'
const fullLiquidationABI = 'event LiquidateCreditAccount(address indexed creditAccount,address indexed liquidator,address to,uint256 remainingFunds)'
const partialLiquidationABI = 'event PartiallyLiquidateCreditAccount(address indexed creditAccount,address indexed token,address indexed liquidator,uint256 repaidDebt,uint256 seizedCollateral,uint256 fee)'
const debtABI = 'function calcDebtAndCollateral(address,uint8) view returns ((uint256 debt,uint256 cumulativeIndexNow,uint256 cumulativeIndexLastUpdate,uint128 cumulativeQuotaInterest,uint256 accruedInterest,uint256 accruedFees,uint256 totalDebtUSD,uint256 totalValue,uint256 totalValueUSD,uint256 twvUSD,uint256 enabledTokensMask,uint256 quotedTokensMask,address[] quotedTokens,address _poolQuotaKeeper))'

export interface FeeBalances {
  dailyFees: Balances
  dailyRevenue: Balances
  dailySupplySideRevenue: Balances
}

interface Split { initialized: boolean; receivers: string[]; proportions: (string | number)[] }

export function daoShare(split: Split, dao: string): number {
  if (!split.initialized || split.receivers.length !== split.proportions.length ||
    split.proportions.reduce<number>((sum, value) => sum + Number(value), 0) !== BPS)
    throw new Error('Invalid Gearbox treasury split')
  return split.receivers.reduce((sum, receiver, i) => sum + (lower(receiver) === lower(dao) ? Number(split.proportions[i]) : 0), 0) / BPS
}

export async function readDaoShare(api: ChainApi, treasury: string, token: string, dao: string, version: number): Promise<number> {
  if (lower(treasury) === lower(dao)) return 1
  // V3.0 curator-owned treasuries retain their income, rather than paying the DAO.
  if (version < 310) return 0
  const tokenSplit: Split = await api.call({ target: treasury, abi: `function tokenSplits(address) view returns (${splitABI})`, params: [token] })
  const split = tokenSplit.initialized ? tokenSplit : await api.call({ target: treasury, abi: `function defaultSplit() view returns (${splitABI})` })
  return daoShare(split, dao)
}

export function interestAmounts(borrowed: string, indexStart: string, indexEnd: string, quota: BigNumber.Value, feeBps: string | number) {
  if (bn(indexStart).lte(0) || bn(indexEnd).lt(indexStart)) throw new Error(`Invalid Gearbox interest index: ${indexStart} -> ${indexEnd}`)
  const base = bn(borrowed).times(bn(indexEnd).minus(indexStart)).div(indexStart)
  const interest = base.plus(quota)
  return { interest, markup: interest.times(feeBps).div(BPS) }
}

export async function readBaseInterestIndexes(api: ChainApi, pools: string[], permitFailure = false) {
  if (api.chain !== 'etlk')
    return api.multiCall({ abi: 'uint256:baseInterestIndex', calls: pools, permitFailure })

  // Etherlink eth_call uses current time even at historical blocks. Reproduce
  // PoolV3._calcBaseInterestIndex from stored fields and the actual block time.
  // https://github.com/Gearbox-protocol/core-v3/blob/main/contracts/pool/PoolV3.sol
  const stored = await api.multiCall({ abi: 'uint256:baseInterestIndexLU', calls: pools, permitFailure })
  const rates = await api.multiCall({ abi: 'uint256:baseInterestRate', calls: pools, permitFailure })
  const updated = await api.multiCall({ abi: 'uint256:lastBaseInterestUpdate', calls: pools, permitFailure })
  const blockNumber = await api.getBlock()
  const block = await api.provider.getBlock(blockNumber)
  if (!block) throw new Error(`Missing Etherlink block: ${blockNumber}`)
  const ray = 10n ** 27n
  return pools.map((pool, i) => {
    if (permitFailure && stored[i] == null && rates[i] == null && updated[i] == null) return null
    if (stored[i] == null || rates[i] == null || updated[i] == null)
      throw new Error(`Missing historical Gearbox index fields: ${pool} at ${blockNumber}`)
    const elapsed = BigInt(block.timestamp) - BigInt(updated[i])
    if (elapsed < 0n) throw new Error(`Invalid Gearbox index timestamp: ${pool} at ${blockNumber}`)
    const growth = BigInt(rates[i]) * elapsed / BigInt(YEAR)
    return (BigInt(stored[i]) * (ray + growth) / ray).toString()
  })
}

function addIncome(balances: FeeBalances, token: string, lenderInterest: BigNumber, treasuryIncome: BigNumber, share: number, source: string) {
  lenderInterest = lenderInterest.integerValue(BigNumber.ROUND_DOWN)
  treasuryIncome = treasuryIncome.integerValue(BigNumber.ROUND_DOWN)
  const daoIncome = treasuryIncome.times(share).integerValue(BigNumber.ROUND_DOWN)
  balances.dailyFees.add(token, lenderInterest.plus(treasuryIncome).toFixed(), source)
  if (!lenderInterest.isZero()) balances.dailySupplySideRevenue.add(token, lenderInterest.toFixed(), `${source} To Lenders`)
  balances.dailySupplySideRevenue.add(token, treasuryIncome.minus(daoIncome).toFixed(), `${source} To Curators`)
  balances.dailyRevenue.add(token, daoIncome.toFixed(), `${source} To DAO`)
}

// Each facade emits after its manager's Repay. Match the nearest preceding,
// unused Repay from that manager, not every repayment in a batched transaction.
export function matchLiquidationRepay(liquidation: any, manager: string, repays: any[], used: Set<any>) {
  const index = (log: any) => Number(log.logIndex ?? log.index)
  const candidates = repays.filter(log => !used.has(log) && log.transactionHash === liquidation.transactionHash &&
    lower(log.args.creditManager) === lower(manager) && index(log) < index(liquidation))
  candidates.sort((a, b) => index(b) - index(a))
  if (!candidates.length) throw new Error(`Missing Gearbox liquidation repayment: ${liquidation.transactionHash}`)
  used.add(candidates[0])
  return candidates[0]
}

// New pools must not be mistaken for archive-RPC failures, or accrue before birth.
async function poolStart(options: FetchOptions, pool: string, initialIndex: string | null) {
  if (initialIndex !== null && initialIndex !== undefined) return { index: initialIndex, timestamp: options.fromTimestamp }
  const provider = options.toApi.provider
  let low = await options.getFromBlock()
  let high = await options.getToBlock()
  if (await provider.getCode(pool, low) !== '0x') throw new Error(`Historical Gearbox index unavailable: ${pool}`)
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    if (await provider.getCode(pool, mid) === '0x') low = mid
    else high = mid
  }
  const block = await provider.getBlock(high)
  if (!block) throw new Error(`Missing Gearbox deployment block: ${high}`)
  const api = new ChainApi({ chain: options.chain, block: high })
  return { index: (await readBaseInterestIndexes(api, [pool]))[0], timestamp: block.timestamp }
}

export async function processV3Services(options: FetchOptions, balances: FeeBalances, services: IGearboxService[]) {
  const { pools, daoTreasury } = await getGearboxPools(options, services)
  if (!pools.length) return
  if (!daoTreasury) throw new Error(`Missing historical Gearbox DAO treasury on ${options.chain}`)
  const api = options.toApi
  const assets: string[] = await api.multiCall({ abi: 'address:asset', calls: pools })
  const treasuries: string[] = await api.multiCall({ abi: 'address:treasury', calls: pools })
  const versions = await api.multiCall({ abi: 'uint256:version', calls: pools })
  const managers: string[][] = await api.multiCall({ abi: 'function creditManagers() view returns (address[])', calls: pools })
  const indexes = await readBaseInterestIndexes(api, pools)
  const initialIndexes = await readBaseInterestIndexes(options.fromApi, pools, true)
  const quotas = await api.multiCall({ abi: 'uint256:quotaRevenue', calls: pools })
  const managerCalls = managers.flatMap((cms, i) => cms.map(cm => ({ target: pools[i], params: [cm] })))
  const debts = await api.multiCall({ abi: 'function creditManagerBorrowed(address) view returns (uint256)', calls: managerCalls })
  const fees = await api.multiCall({ abi: GearboxAbis.CreditManagerFees, calls: managers.flat() })
  const facades: string[] = await api.multiCall({ abi: 'address:creditFacade', calls: managers.flat() })
  const previousFacades: (string | null)[] = await options.fromApi.multiCall({ abi: 'address:creditFacade', calls: managers.flat(), permitFailure: true })
  const splitPools = pools.map((_, i) => i).filter(i => Number(versions[i]) >= 310 && lower(treasuries[i]) !== lower(daoTreasury))
  const tokenSplits: Split[] = await api.multiCall({
    abi: `function tokenSplits(address) view returns (${splitABI})`,
    calls: splitPools.map(i => ({ target: treasuries[i], params: [pools[i]] })),
  })
  const defaultTargets = [...new Set(splitPools.filter((_, j) => !tokenSplits[j].initialized).map(i => treasuries[i]))]
  const defaults: Split[] = await api.multiCall({ abi: `function defaultSplit() view returns (${splitABI})`, calls: defaultTargets })
  const shares: number[] = pools.map((_, i) => lower(treasuries[i]) === lower(daoTreasury) ? 1 : 0)
  splitPools.forEach((i, j) => {
    const split = tokenSplits[j].initialized ? tokenSplits[j] : defaults[defaultTargets.indexOf(treasuries[i])]
    shares[i] = daoShare(split, daoTreasury)
  })
  const managerPool = new Map<string, number>()
  const facadeManager = new Map<string, string>()
  let offset = 0
  for (let i = 0; i < pools.length; i++) {
    const start = await poolStart(options, pools[i], initialIndexes[i])
    const elapsed = Math.max(0, options.toTimestamp - start.timestamp)
    const poolDebts = debts.slice(offset, offset + managers[i].length)
    const totalBorrowed = poolDebts.reduce((sum: BigNumber, debt: string) => sum.plus(debt), bn(0))
    const share = shares[i]
    for (let j = 0; j < managers[i].length; j++) {
      const cm = managers[i][j]
      managerPool.set(lower(cm), i)
      facadeManager.set(lower(facades[offset + j]), cm)
      const oldFacade = previousFacades[offset + j]
      if (oldFacade) facadeManager.set(lower(oldFacade), cm)
      else if (await api.provider.getCode(cm, await options.getFromBlock()) !== '0x')
        throw new Error(`Historical Gearbox facade unavailable: ${cm}`)
      // Token Terminal's daily model samples debt/rates at period end. This is
      // an accrual estimate; intraperiod debt/quota changes are not integrated.
      const quota = totalBorrowed.isZero() ? bn(0) : bn(quotas[i]).times(elapsed).div(YEAR).times(poolDebts[j]).div(totalBorrowed)
      const { interest, markup } = interestAmounts(poolDebts[j], start.index, indexes[i], quota, fees[offset + j].feeInterest)
      addIncome(balances, assets[i], interest, markup, share, 'Borrow Interest')
    }
    offset += managers[i].length
  }

  const targets = [...facadeManager.keys()]
  if (!targets.length) return
  const fromBlock = await options.getFromBlock() + 1
  // Monad's public archive limits logs to 1,000 blocks; leave room for the
  // SDK's ten-block cache buffer on each side of a requested range.
  const maxBlockRange = options.chain === 'monad' ? 980 : undefined
  const logOptions = { entireLog: true, parseLog: true, fromBlock, maxBlockRange }
  const full = await options.getLogs({ targets, eventAbi: fullLiquidationABI, ...logOptions })
  const partial = await options.getLogs({ targets, eventAbi: partialLiquidationABI, ...logOptions })
  const repays = full.length ? await options.getLogs({ targets: pools, eventAbi: GearboxAbis.PoolRepay, ...logOptions }) : []
  const used = new Set<any>()
  // Group event-block calls to reuse snapshots and avoid parallel RPC pressure.
  const blocks = [...new Set<number>([...full, ...partial].map(log => Number(log.blockNumber)))].sort((a, b) => a - b)
  for (const block of blocks) {
    const eventApi = new ChainApi({ chain: options.chain, block })
    const fullAtBlock = full.filter(log => Number(log.blockNumber) === block)
    const priorApi = new ChainApi({ chain: options.chain, block: block - 1 })
    const priorDebts = await priorApi.multiCall({ abi: debtABI, calls: fullAtBlock.map(log => ({
      target: facadeManager.get(lower(log.address))!, params: [log.args.creditAccount, 1],
    })) })
    for (let j = 0; j < fullAtBlock.length; j++) {
      const log = fullAtBlock[j]
      const cm = facadeManager.get(lower(log.address))!
      const i = managerPool.get(lower(cm))!
      const repay = matchLiquidationRepay(log, cm, repays, used)
      // Repay.profit already includes accrued interest/quota markups. Counting
      // it again would recognize both accrual and repayment of the same fees.
      const liquidationFee = BigNumber.maximum(0, bn(repay.args.profit.toString()).minus(priorDebts[j].accruedFees))
      const dao = Number(versions[i]) >= 310 ? await getDaoTreasury(eventApi) : daoTreasury
      const share = await readDaoShare(eventApi, treasuries[i], pools[i], dao, Number(versions[i]))
      addIncome(balances, assets[i], bn(0), liquidationFee, share, 'Liquidation Fees')
    }
    for (const log of partial.filter(log => Number(log.blockNumber) === block)) {
      const cm = facadeManager.get(lower(log.address))!
      const i = managerPool.get(lower(cm))!
      const treasury = await eventApi.call({ target: log.address, abi: 'address:treasury' })
      const dao = await getDaoTreasury(eventApi)
      // Partial liquidation transfers underlying, unlike Repay's pool-share mint.
      const share = await readDaoShare(eventApi, treasury, assets[i], dao, Number(versions[i]))
      addIncome(balances, assets[i], bn(0), bn(log.args.fee.toString()), share, 'Liquidation Fees')
    }
  }
}
