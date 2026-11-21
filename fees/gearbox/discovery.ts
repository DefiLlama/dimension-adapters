import { ChainApi } from '@defillama/sdk'
import { FetchOptions } from '../../adapters/types'
import { IGearboxService } from './configs'

// Deterministic V3.1 deployment on every supported network:
// https://github.com/Gearbox-protocol/sdk/blob/master/src/onchain/constants/address-provider.ts
export const ADDRESS_PROVIDER = '0xF7f0a609BfAb9a0A98786951ef10e5FE26cC1E38'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const addressAbi = 'function getAddress(bytes32 key, uint256 ver) view returns (address)'
const key = (name: string) => `0x${Buffer.from(name).toString('hex').padEnd(64, '0')}`
const unique = (addresses: string[]): string[] => [...new Set(addresses.map(address => address.toLowerCase()))]
// Legacy providers from Gearbox's published DefiLlama adapter:
// https://github.com/Gearbox-protocol/defillama/blob/main/src/adapter/constants.ts
const LEGACY_ADDRESS_PROVIDERS: Record<string, string> = {
  ethereum: '0x9ea7b04da02a5373317d745c1571c84aad03321d',
  arbitrum: '0x7d04eCdb892Ae074f03B5D0aBA03796F90F3F2af',
  optimism: '0x3761ca4BFAcFCFFc1B8034e69F19116dD6756726',
  sonic: '0x4b27b296273B72d7c7bfee1ACE93DC081467C41B',
}

export async function getDaoTreasury(api: ChainApi): Promise<string> {
  const current = await api.call({ target: ADDRESS_PROVIDER, abi: addressAbi, params: [key('TREASURY'), 0], permitFailure: true })
  if (current && current.toLowerCase() !== ZERO_ADDRESS) return current
  const code = await api.provider.getCode(ADDRESS_PROVIDER, await api.getBlock())
  const target = code === '0x' ? LEGACY_ADDRESS_PROVIDERS[api.chain] : ADDRESS_PROVIDER
  if (!target) throw new Error(`No deployed Gearbox DAO address provider for ${api.chain}`)
  return api.call({
    target,
    abi: 'function getAddressOrRevert(bytes32 key, uint256 ver) view returns (address)',
    params: [key('TREASURY'), 0],
  })
}

export async function getGearboxPools(options: FetchOptions, services: IGearboxService[]) {
  const api = options.toApi
  const candidates = unique(services.filter(service => service.version === 3).map(service => service.pool))
  const versions = candidates.length ? await api.multiCall({ abi: 'uint256:version', calls: candidates, permitFailure: true }) : []
  const pools: string[] = []
  for (let i = 0; i < candidates.length; i++) {
    if (versions[i] != null) pools.push(candidates[i])
    else if (await api.provider.getCode(candidates[i], await options.getToBlock()) !== '0x') {
      throw new Error(`Could not read deployed Gearbox pool ${candidates[i]} at the interval end`)
    }
  }
  // A missing deployment is distinct from an RPC failure: only verified empty
  // bytecode skips discovery; provider errors propagate rather than losing fees.
  const factory = await api.call({ target: ADDRESS_PROVIDER, abi: addressAbi, params: [key('MARKET_CONFIGURATOR_FACTORY'), 0], permitFailure: true })
  if (!factory) {
    const code = await api.provider.getCode(ADDRESS_PROVIDER, await options.getToBlock())
    if (code !== '0x') throw new Error('Could not read deployed Gearbox market factory')
    return { pools, daoTreasury: pools.length ? await getDaoTreasury(api) : undefined }
  }
  // AddressProvider can exist before the instance's factory is configured.
  if (factory.toLowerCase() === ZERO_ADDRESS) return { pools, daoTreasury: pools.length ? await getDaoTreasury(api) : undefined }

  // Mirrors DefillamaCompressor discovery, retaining shutdown registries/pools
  // so a shutdown during the requested interval does not erase its fee history.
  // https://github.com/Gearbox-protocol/permissionless/blob/main/contracts/instance/MarketConfiguratorFactory.sol
  const activeConfigurators = await api.call({ target: factory, abi: 'function getMarketConfigurators() view returns (address[])' })
  const shutdownConfigurators = await api.call({ target: factory, abi: 'function getShutdownMarketConfigurators() view returns (address[])' })
  const configurators = unique([...activeConfigurators, ...shutdownConfigurators])
  if (configurators.length) {
    const registers = await api.multiCall({ abi: 'address:contractsRegister', calls: configurators })
    const active = await api.multiCall({ abi: 'function getPools() view returns (address[])', calls: registers })
    const shutdown = await api.multiCall({ abi: 'function getShutdownPools() view returns (address[])', calls: registers })
    pools.push(...active.flat(), ...shutdown.flat())
  }
  return { pools: unique(pools), daoTreasury: await getDaoTreasury(api) }
}
