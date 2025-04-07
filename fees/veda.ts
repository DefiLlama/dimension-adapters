import { Interface } from "ethers"
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import * as sdk from '@defillama/sdk'

/**
 *
 * Veda reinvest staked assets into others platforms and earning yield
 * Yields are distributed to stakers and Veda protocol:.
 * 
 * Veda takes these fees:
 * - Performance fees, a percentage amount of yield (config per vault)
 * - Platform fees, a basic percentage amount of total assets in the vault (config per vault)
 */

const methodology = {
  Fees: 'Total yields are genearted by staking assets.',
  SupplySideRevenue: 'The amount of yields are distibuted to stakers.',
  ProtocolRevenue: 'The amount of yields are distibuted to Veda Protocol.',
}

interface IBoringVault {
  vault: string;
  paltformFee: number;
  performanceFee?: number;
}

const BoringVaults: {[key: string]: Array<IBoringVault>} = {
  [CHAIN.ETHEREUM]: [
    {
      vault: '0xf0bb20865277aBd641a307eCe5Ee04E79073416C',
      paltformFee: 0.01, // 1%
    },
    {
      vault: '0xC673ef7791724f0dcca38adB47Fbb3AEF3DB6C80',
      paltformFee: 0,
    },
    {
      vault: '0x83599937c2C9bEA0E0E8ac096c6f32e86486b410',
      paltformFee: 0,
    },
    {
      vault: '0x5401b8620E5FB570064CA9114fd1e135fd77D57c',
      paltformFee: 0.015,
    },
    {
      vault: '0x309f25d839A2fe225E80210e110C99150Db98AAF',
      paltformFee: 0.015,
    },
    {
      vault: '0x5f46d540b6eD704C3c8789105F30E075AA900726',
      paltformFee: 0.02,
    },
    {
      vault: '0xca8711dAF13D852ED2121E4bE3894Dae366039E4',
      paltformFee: 0.02,
    },
    {
      vault: '0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C',
      paltformFee: 0.02,
    },
    {
      vault: '0xFE0C961A49E1aEe2AE2d842fE40157365C6d978f',
      paltformFee: 0,
    },
    {
      vault: '0x352180974C71f84a934953Cf49C4E538a6F9c997',
      paltformFee: 0,
    },
    {
      vault: '0xbc0f3B23930fff9f4894914bD745ABAbA9588265',
      paltformFee: 0.02,
      performanceFee: 0.2, // 20%
    },
    {
      vault: '0x42A03534DBe07077d705311854E3B6933dD6Af85',
      paltformFee: 0,
      performanceFee: 0.2, // 20%
    },
    {
      vault: '0xeDa663610638E6557c27e2f4e973D3393e844E70',
      paltformFee: 0.02,
    },
  ],
  [CHAIN.SONIC]: [
    {
      vault: '0x309f25d839A2fe225E80210e110C99150Db98AAF',
      paltformFee: 0.02,
    }
  ],
  [CHAIN.BASE]: [
    {
      vault: '0x42A03534DBe07077d705311854E3B6933dD6Af85',
      paltformFee: 0,
      performanceFee: 0.2, // 20%
    }
  ],
}

const BoringVaultAbis = {
  //vault
  hook: 'address:hook',
  decimals: 'uint8:decimals',
  totalSupply: 'uint256:totalSupply',
  
  // hook
  accountant: 'address:accountant',
  
  // accountant
  base: 'address:base',
  getRate: 'uint256:getRate',
  exchangeRateUpdated: 'event ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)',
}

interface ExchangeRateUpdatedEvent {
  blockNumber: number;
  oldRate: bigint;
  newRate: bigint;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const vaults = BoringVaults[options.chain];

  if (vaults) {
    const getHooks: Array<string> = await options.api.multiCall({
      abi: BoringVaultAbis.hook,
      calls: vaults.map(vault => vault.vault),
    })
    const getDecimals: Array<string> = await options.api.multiCall({
      abi: BoringVaultAbis.decimals,
      calls: vaults.map(vault => vault.vault),
    })
    const getAccountants: Array<string> = await options.api.multiCall({
      abi: BoringVaultAbis.accountant,
      calls: getHooks,
    })
    const getTokens: Array<string> = await options.api.multiCall({
      abi: BoringVaultAbis.base,
      calls: getAccountants,
    })

    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i]
      const vaultRateBase = Number(10 ** Number(getDecimals[i]))
      const accountant = getAccountants[i]
      const token = getTokens[i]

      // get vaults rate updateed events
      const lendingPoolContract: Interface = new Interface([
        BoringVaultAbis.exchangeRateUpdated,
      ])
      const events: Array<ExchangeRateUpdatedEvent> = (await options.getLogs({
        eventAbi: BoringVaultAbis.exchangeRateUpdated,
        entireLog: true,
        target: accountant,
      }))
      .map(log => {
        const decodeLog: any = lendingPoolContract.parseLog(log);

        const event: any = {
          blockNumber: Number(log.blockNumber),
          oldRate: decodeLog.args[0],
          newRate: decodeLog.args[1],
        }

        return event
      })
      
      for (const event of events) {
        // newRate - oldRate
        const growthRate = event.newRate > event.oldRate ? Number(event.newRate - event.oldRate) : 0;

        // don't need to make calls if there isn't rate growth
        if (growthRate > 0) {
          // get total staked in vault at the given block
          // it's safe for performance because ExchangeRateUpdated events
          // occur daily once
          const totalSupplyAtUpdated = await sdk.api2.abi.call({
            abi: BoringVaultAbis.totalSupply,
            target: vault.vault,
            block: event.blockNumber,
          })
          const getRateAtUpdated = await sdk.api2.abi.call({
            abi: BoringVaultAbis.getRate,
            target: accountant,
            block: event.blockNumber,
          })

          // rate is always greater than or equal 1
          const totalDeposited = Number(totalSupplyAtUpdated) * Number(getRateAtUpdated) / vaultRateBase

          const performanceFeeRate = vault.performanceFee ? vault.performanceFee : 0;
          const supplySideYield = totalDeposited * growthRate / vaultRateBase
          const totalYield = supplySideYield / (1 - performanceFeeRate)
          const protocolFee = totalYield - supplySideYield

          dailyFees.add(token, totalYield)
          dailySupplySideRevenue.add(token, supplySideYield)
          dailyProtocolRevenue.add(token, protocolFee)
        }
      }

      // get total asset are deposited in vault
      const totalSupply = await options.api.call({
        abi: BoringVaultAbis.totalSupply,
        target: vault.vault,
      })
      const getRate = await options.api.call({
        abi: BoringVaultAbis.getRate,
        target: accountant,
      })
      const totalDeposited = Number(totalSupply) * Number(getRate) / vaultRateBase

      // platform fees changred by Veda per year of total assets in vault
      const yearInSecs = 365 * 24 * 60 * 60
      const timespan = Number(options.toApi.timestamp) - Number(options.fromApi.timestamp)
      const platformFee = totalDeposited * vault.paltformFee * timespan / yearInSecs

      dailyFees.add(token, platformFee)
      dailyProtocolRevenue.add(token, platformFee)
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      meta: {
        methodology,
      },
      start: '2024-4-16',
    },
    [CHAIN.SONIC]: {
      fetch: fetch,
      meta: {
        methodology,
      },
      start: '2025-02-07',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      meta: {
        methodology,
      },
      start: '2024-09-06',
    },
  }
}

export default adapter
