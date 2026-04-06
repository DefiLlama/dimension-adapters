import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const Liquidate = 'event Liquidate(address indexed asset, address indexed user, uint256 shareAmountRepaid, uint256 seizedCollateral)'
const NewSiloCreated = 'event NewSiloCreated(address indexed silo, address indexed asset, uint128 version)'

interface Factory {
  address: string
  block: number
}

const config: Record<string, { factories: Factory[]; start: string }> = {
  [CHAIN.ETHEREUM]: {
    factories: [
      { address: '0x4D919CEcfD4793c0D47866C8d0a02a0950737589', block: 15307294 },
      { address: '0x6d4A256695586F61b77B09bc3D28333A91114d5a', block: 17391885 },
      { address: '0x2c0fA05281730EFd3ef71172d8992500B36b56eA', block: 17782576 },
    ],
    start: '2022-08-10',
  },
  [CHAIN.ARBITRUM]: {
    factories: [
      { address: '0x4166487056A922D784b073d4d928a516B074b719', block: 51894508 },
    ],
    start: '2023-05-02',
  },
  [CHAIN.OPTIMISM]: {
    factories: [
      { address: '0x6B14c4450a29Dd9562c20259eBFF67a577b540b9', block: 120480601 },
    ],
    start: '2024-05-25',
  },
  [CHAIN.BASE]: {
    factories: [
      { address: '0x408822E4E8682413666809b0655161093cd36f2b', block: 16262586 },
    ],
    start: '2024-06-26',
  },
}

const fetch = async (options: FetchOptions) => {
  const dailyLiquidations = options.createBalances()
  const dailyLiquidationRepaidDebt = options.createBalances()

  const { factories } = config[options.chain]

  const siloAddresses: string[] = []
  for (const factory of factories) {
    const events = await options.getLogs({
      target: factory.address,
      eventAbi: NewSiloCreated,
      fromBlock: factory.block,
      cacheInCloud: true,
    })
    for (const event of events) {
      siloAddresses.push(event.silo)
    }
  }

  const allEvents = await Promise.all(
    siloAddresses.map(silo => options.getLogs({ target: silo, eventAbi: Liquidate }))
  )

  const liquidationData: { silo: string; event: any }[] = []
  for (let i = 0; i < siloAddresses.length; i++) {
    for (const event of allEvents[i]) {
      liquidationData.push({ silo: siloAddresses[i], event })
    }
  }

  if (liquidationData.length > 0) {
    // Resolve debt share tokens for (silo, asset) pairs with repaid shares
    const debtPairs = liquidationData
      .filter(d => d.event.shareAmountRepaid > 0)
      .map(d => ({ silo: d.silo, asset: d.event.asset }))
    const uniqueKeys = Array.from(new Set(debtPairs.map(p => `${p.silo}:${p.asset}`)))
    const uniquePairs = uniqueKeys.map(k => { const [silo, asset] = k.split(':'); return { silo, asset } })

    const assetStorages = await options.api.multiCall({
      calls: uniquePairs.map(p => ({ target: p.silo, params: [p.asset] })),
      abi: 'function assetStorage(address _asset) view returns (address collateralToken, address collateralOnlyToken, address debtToken, uint256 totalDeposits, uint256 collateralOnlyDeposits, uint256 totalBorrowAmount)',
      permitFailure: true,
    })

    // Get debt token total supplies for conversion to underlying
    const debtTokens = uniquePairs.map((_, i) => assetStorages[i]?.debtToken).filter(Boolean)
    const debtTokenSupplies = await options.api.multiCall({
      calls: debtTokens,
      abi: 'uint256:totalSupply',
      permitFailure: true,
    })

    const debtConversionMap: Record<string, { asset: string; totalBorrow: bigint; totalSupply: bigint }> = {}
    for (let i = 0; i < uniquePairs.length; i++) {
      const storage = assetStorages[i]
      if (!storage?.debtToken) continue
      const supplyIdx = debtTokens.indexOf(storage.debtToken)
      if (supplyIdx === -1 || !debtTokenSupplies[supplyIdx]) continue
      debtConversionMap[uniqueKeys[i]] = {
        asset: uniquePairs[i].asset,
        totalBorrow: BigInt(storage.totalBorrowAmount),
        totalSupply: BigInt(debtTokenSupplies[supplyIdx]),
      }
    }

    for (const { silo, event } of liquidationData) {
      if (event.seizedCollateral > 0) {
        dailyLiquidations.add(event.asset, event.seizedCollateral)
      }
      if (event.shareAmountRepaid > 0) {
        const conv = debtConversionMap[`${silo}:${event.asset}`]
        if (conv && conv.totalSupply > 0n) {
          const underlyingRepaid = BigInt(event.shareAmountRepaid) * conv.totalBorrow / conv.totalSupply
          dailyLiquidationRepaidDebt.add(conv.asset, underlyingRepaid)
        }
      }
    }
  }

  return { dailyLiquidations, dailyLiquidationRepaidDebt }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology: {
    Liquidations: 'Total USD value of collateral seized in Silo V1 Liquidate events.',
    LiquidationRepaidDebt: 'Total USD value of debt repaid in Silo V1 Liquidate events.',
  },
}

export default adapter
