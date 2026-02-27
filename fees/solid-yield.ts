import { Interface } from "ethers"
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import * as sdk from '@defillama/sdk'

/**
 *
 * Solid Yield reinvest staked assets into others platforms and earning yield
 * Yields are distributed to stakers and Solid Yield protocol:.
 * 
 * Solid Yield takes these fees:
 * - Performance fees, a percentage amount of yield (config per vault)
 * - Platform fees, a basic percentage amount of total assets in the vault (config per vault)
 */

interface IBoringVault {
  vault: string;
  accountantAbiVersion: 1 | 2;
}

const BoringVaults: { [key: string]: Array<IBoringVault> } = {
  [CHAIN.ETHEREUM]: [
    {
      vault: '0x6E575AE5e1A12e910641183F555Fad62eD1481F2',
      accountantAbiVersion: 2,
    },
  ],
  [CHAIN.FUSE]: [
    {
      vault: '0x75333830E7014e909535389a6E5b0C02aA62ca27',
      accountantAbiVersion: 2,
    },
    {
      vault: '0xb33c8F0b0816fd147FCF896C594a3ef408845e2C',
      accountantAbiVersion: 2,
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
  exchangeRateUpdated: 'event ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)',
  accountantState: {
    1: 'function accountantState() view returns(address,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint32,uint16)',
    2: 'function accountantState() view returns(address,uint96,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint24,uint16,uint16)',
  },
}

const AccountantFeeRateBase = 1e4

interface ExchangeRateUpdatedEvent {
  blockNumber: number;
  oldRate: bigint;
  newRate: bigint;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const vaults = BoringVaults[options.chain]
  if (vaults.length === 0) {
    throw new Error(`No vaults found for chain ${options.chain}`)
  }

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

    // get vaults rate updated events
    const lendingPoolContract: Interface = new Interface([
      BoringVaultAbis.exchangeRateUpdated,
    ])
    const events: Array<ExchangeRateUpdatedEvent> = (await options.getLogs({
      eventAbi: BoringVaultAbis.exchangeRateUpdated,
      entireLog: true,
      target: accountant,
    }))
      .map(log => {
        const decodeLog: any = lendingPoolContract.parseLog(log)

        const event: any = {
          blockNumber: Number(log.blockNumber),
          oldRate: decodeLog.args[0],
          newRate: decodeLog.args[1],
        }

        return event
      })

    for (const event of events) {
      // newRate - oldRate
      const growthRate = event.newRate > event.oldRate ? Number(event.newRate - event.oldRate) : 0
      if (growthRate > 10_000) continue
      // don't need to make calls if there isn't rate growth
      if (growthRate > 0) {

        // get total staked in vault at the given block
        // it's safe for performance because ExchangeRateUpdated events
        // occur daily once
        const totalSupplyAtUpdated = await sdk.api2.abi.call({
          abi: BoringVaultAbis.totalSupply,
          target: vault.vault,
          block: event.blockNumber,
          chain: options.chain,
        })
        const getAccountantState = await sdk.api2.abi.call({
          abi: BoringVaultAbis.accountantState[vault.accountantAbiVersion],
          target: accountant,
          block: event.blockNumber,
          chain: options.chain,
        })

        let exchangeRate = vaultRateBase
        let performanceFeeRate = 0
        if (vault.accountantAbiVersion === 2) {
          exchangeRate = Number(getAccountantState[4])

          // only version 2 vaults have performance fee config
          performanceFeeRate = Number(getAccountantState[11]) / AccountantFeeRateBase
        } else {
          exchangeRate = Number(getAccountantState[3])
        }

        // rate is always greater than or equal 1
        const totalDeposited = Number(totalSupplyAtUpdated) * Number(exchangeRate) / vaultRateBase

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
    const getAccountantState = await options.api.call({
      abi: BoringVaultAbis.accountantState[vault.accountantAbiVersion],
      target: accountant,
    })

    const exchangeRate = vault.accountantAbiVersion === 1 ? Number(getAccountantState[3]) : Number(getAccountantState[4])
    const platformFeeRate = vault.accountantAbiVersion === 1 ? Number(getAccountantState[9]) : Number(getAccountantState[10])

    const totalDeposited = Number(totalSupply) * Number(exchangeRate) / vaultRateBase

    // platform fees changred by Solid Yield per year of total assets in vault
    const yearInSecs = 365 * 24 * 60 * 60
    const timespan = options.toApi.timestamp && options.fromApi.timestamp ? Number(options.toApi.timestamp) - Number(options.fromApi.timestamp) : 86400
    const platformFee = totalDeposited * (platformFeeRate / AccountantFeeRateBase) * timespan / yearInSecs

    dailyFees.add(token, platformFee)
    dailyProtocolRevenue.add(token, platformFee)
  }

  return {
    dailyFees,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total yields are generated by staking assets.',
  Revenue: 'Performance fees and platform fees are distibuted to Solid Yield Protocol.',
  ProtocolRevenue: 'Performance fees and platform fees are distibuted to Solid Yield Protocol.',
  SupplySideRevenue: 'The amount of yields are distibuted to stakers.',
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2025-06-07',
    },
    [CHAIN.FUSE]: {
      start: '2025-06-07',
    },
  }
}

export default adapter
