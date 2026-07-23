import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { METRIC } from '../helpers/metrics'

const HUBS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9', // Core
    '0x06002e9c4412CB7814a791eA3666D905871E536A', // Plus
    '0x943827DCA022D0F354a8a8c332dA1e5Eb9f9F931', // Prime
  ],
}

const abis = {
  getAssetCount: 'uint256:getAssetCount',
  getAssetUnderlyingAndDecimals: 'function getAssetUnderlyingAndDecimals(uint256) view returns (address, uint8)',
  getAssetAccruedFees: 'function getAssetAccruedFees(uint256) view returns (uint256)',
  getAsset: 'function getAsset(uint256) view returns (tuple(uint120 liquidity, uint120 realizedFees, uint8 decimals, uint120 addedShares, uint120 swept, int200 premiumOffsetRay, uint120 drawnShares, uint120 premiumShares, uint16 liquidityFee, uint120 drawnIndex, uint96 drawnRate, uint40 lastUpdateTimestamp, address underlying, address irStrategy, address reinvestmentController, address feeReceiver, uint200 deficitRay))',
  getSpokeCount: 'function getSpokeCount(uint256) view returns (uint256)',
  getSpokeAddress: 'function getSpokeAddress(uint256, uint256) view returns (address)',
  MintFeeShares: 'event MintFeeShares(uint256 indexed assetId, address indexed feeReceiver, uint256 shares, uint256 assets)',
  LiquidationCall: 'event LiquidationCall(uint256 indexed collateralReserveId, uint256 indexed debtReserveId, address indexed user, address liquidator, bool receiveShares, uint256 debtAmountRestored, uint256 drawnSharesLiquidated, tuple(int256 sharesDelta, int256 offsetRayDelta, uint256 restoredPremiumRay) premiumDelta, uint256 collateralAmountRemoved, uint256 collateralSharesLiquidated, uint256 collateralSharesToLiquidator)',
  getReserve: 'function getReserve(uint256) view returns (tuple(address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))',
  getReserveCount: 'uint256:getReserveCount',
  ORACLE: 'address:ORACLE',
  getReservePrice: 'function getReservePrice(uint256) view returns (uint256)',
}

async function discoverSpokes(api: any, hubs: string[], assetCounts: number[]): Promise<string[]> {
  const countCalls = hubs.flatMap((hub, i) =>
    Array.from({ length: assetCounts[i] }, (_, assetId) => ({ target: hub, params: [assetId] }))
  )
  const spokeCounts = await api.multiCall({ abi: abis.getSpokeCount, calls: countCalls, permitFailure: true })

  const addrCalls: any[] = []
  spokeCounts.forEach((count: any, idx: number) => {
    if (count === null) return
    const { target, params } = countCalls[idx]
    for (let j = 0; j < count; j++) {
      addrCalls.push({ target, params: [params[0], j] })
    }
  })

  if (addrCalls.length === 0) return []
  const addrs = await api.multiCall({ abi: abis.getSpokeAddress, calls: addrCalls })

  const candidates = [...new Set<string>(addrs)]
  const reserveCounts = await api.multiCall({ abi: abis.getReserveCount, calls: candidates, permitFailure: true })
  return candidates.filter((_: string, i: number) => reserveCounts[i] !== null)
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const hubs = HUBS[options.chain]
  const assetCounts: number[] = await options.fromApi.multiCall({ abi: abis.getAssetCount, calls: hubs })

  const allCalls = hubs.flatMap((hub, i) =>
    Array.from({ length: assetCounts[i] }, (_, assetId) => ({ target: hub, params: [assetId] }))
  )

  const [underlyings, assetConfigs, feesBefore, feesAfter] = await Promise.all([
    options.fromApi.multiCall({ abi: abis.getAssetUnderlyingAndDecimals, calls: allCalls }),
    options.fromApi.multiCall({ abi: abis.getAsset, calls: allCalls }),
    options.fromApi.multiCall({ abi: abis.getAssetAccruedFees, calls: allCalls }),
    options.toApi.multiCall({ abi: abis.getAssetAccruedFees, calls: allCalls }),
  ])

  const mintLogsByHub = await options.getLogs({
    targets: hubs,
    eventAbi: abis.MintFeeShares,
    flatten: false,
  })

  const mintedByKey: Record<string, bigint> = {}
  mintLogsByHub.forEach((logs, hubIdx) => {
    for (const log of logs) {
      const key = `${hubs[hubIdx]}-${Number(log.assetId)}`
      mintedByKey[key] = (mintedByKey[key] || 0n) + BigInt(log.assets)
    }
  })

  for (let i = 0; i < allCalls.length; i++) {
    const token = underlyings[i][0]
    const liquidityFee = Number(assetConfigs[i].liquidityFee)
    if (liquidityFee === 0) continue

    const key = `${allCalls[i].target}-${allCalls[i].params[0]}`
    const protocolRevenue = BigInt(feesAfter[i]) - BigInt(feesBefore[i]) + (mintedByKey[key] || 0n)
    if (protocolRevenue <= 0n) continue

    const interestAccrued = protocolRevenue * 10000n / BigInt(liquidityFee)
    const supplySideRevenue = interestAccrued - protocolRevenue

    dailyFees.add(token, interestAccrued, METRIC.BORROW_INTEREST)
    dailyProtocolRevenue.add(token, protocolRevenue, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.add(token, supplySideRevenue, METRIC.BORROW_INTEREST)
  }

  const spokes = await discoverSpokes(options.fromApi, hubs, assetCounts)

  const [allLogs, allOracles, allReserveCounts] = await Promise.all([
    options.getLogs({
        targets: spokes,
        eventAbi: abis.LiquidationCall,
        flatten: false,
    }),
    options.fromApi.multiCall({ abi: abis.ORACLE, calls: spokes }),
    options.fromApi.multiCall({ abi: abis.getReserveCount, calls: spokes }),
  ])

  const spokesWithLogs = spokes
    .map((spoke, idx) => ({ spoke, logs: allLogs[idx], oracle: allOracles[idx], reserveCount: Number(allReserveCounts[idx]) }))
    .filter(s => s.logs.length > 0)

  const allReserveCalls = spokesWithLogs.flatMap(s =>
    Array.from({ length: s.reserveCount }, (_, i) => ({ target: s.spoke, params: [i] }))
  )
  const allReserves = allReserveCalls.length > 0
    ? await options.fromApi.multiCall({ abi: abis.getReserve, calls: allReserveCalls })
    : []

  const reservesBySpoke: Record<string, any[]> = {}
  let offset = 0
  for (const s of spokesWithLogs) {
    reservesBySpoke[s.spoke] = allReserves.slice(offset, offset + s.reserveCount)
    offset += s.reserveCount
  }

  const priceCallsMap = new Map<string, { oracle: string; reserveId: number }>()
  for (const s of spokesWithLogs) {
    for (const log of s.logs) {
      const colId = Number(log.collateralReserveId)
      const debtId = Number(log.debtReserveId)
      priceCallsMap.set(`${s.oracle}-${colId}`, { oracle: s.oracle, reserveId: colId })
      priceCallsMap.set(`${s.oracle}-${debtId}`, { oracle: s.oracle, reserveId: debtId })
    }
  }

  const priceCallEntries = [...priceCallsMap.entries()]
  const prices = priceCallEntries.length > 0
    ? await options.fromApi.multiCall({
        abi: abis.getReservePrice,
        calls: priceCallEntries.map(([, v]) => ({ target: v.oracle, params: [v.reserveId] })),
      })
    : []

  const priceMap: Record<string, bigint> = {}
  priceCallEntries.forEach(([key], i) => { priceMap[key] = BigInt(prices[i]) })

  for (const s of spokesWithLogs) {
    const reserves = reservesBySpoke[s.spoke]

    for (const log of s.logs) {
      const collateralReserveId = Number(log.collateralReserveId)
      const debtReserveId = Number(log.debtReserveId)
      const collateralToken = reserves[collateralReserveId]?.underlying
      if (!collateralToken) continue

      const collateralPrice = priceMap[`${s.oracle}-${collateralReserveId}`]
      const debtPrice = priceMap[`${s.oracle}-${debtReserveId}`]

      const collateralRemoved = BigInt(log.collateralAmountRemoved)
      const debtRestored = BigInt(log.debtAmountRestored)
      const sharesLiquidated = BigInt(log.collateralSharesLiquidated)
      const sharesToLiquidator = BigInt(log.collateralSharesToLiquidator)
      if (sharesLiquidated === 0n) continue

      const collateralUnit = 10n ** BigInt(reserves[collateralReserveId].decimals)
      const debtUnit = 10n ** BigInt(reserves[debtReserveId].decimals)
      const fairCollateral = debtRestored * debtPrice * collateralUnit / (debtUnit * collateralPrice)
      //bonus = collateral seized - fair value of debt repaid
      const totalBonus = collateralRemoved > fairCollateral ? collateralRemoved - fairCollateral : 0n
      const protocolFeeAmount = collateralRemoved * (sharesLiquidated - sharesToLiquidator) / sharesLiquidated
      const liquidatorBonus = totalBonus > protocolFeeAmount ? totalBonus - protocolFeeAmount : 0n

      dailyFees.add(collateralToken, totalBonus, METRIC.LIQUIDATION_FEES)
      dailySupplySideRevenue.add(collateralToken, liquidatorBonus, METRIC.LIQUIDATION_FEES)
      dailyProtocolRevenue.add(collateralToken, protocolFeeAmount, METRIC.LIQUIDATION_FEES)
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Fees: 'Borrow interest paid by borrowers plus protocol share of liquidation bonuses.',
  Revenue: 'Protocol share of borrow interest plus protocol share of liquidation bonuses.',
  SupplySideRevenue: 'Interest distributed to depositors after protocol fee.',
  ProtocolRevenue: 'Protocol share of borrow interest plus protocol share of liquidation bonuses.',
  HoldersRevenue: 'No revenue shared to AAVE holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers across all Hub assets.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation bonuses paid by borrowers.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest.',
    [METRIC.LIQUIDATION_FEES]: 'Protocol share of liquidation bonuses.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Interest distributed to depositors after protocol fee.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation bonuses received by liquidators.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest.',
    [METRIC.LIQUIDATION_FEES]: 'Protocol share of liquidation bonuses.',
  },
}

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: '2026-03-30' },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
