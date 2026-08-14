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
  const dailyCollateralLiquidated = options.createBalances()

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
  for (const events of allEvents) {
    for (const event of events) {
      if (event.seizedCollateral > 0) {
        dailyCollateralLiquidated.add(event.asset, event.seizedCollateral)
      }
    }
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in Silo V1 Liquidate events.',
  },
}

export default adapter
