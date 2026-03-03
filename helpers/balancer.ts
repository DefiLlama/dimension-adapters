import { BaseAdapter, FetchOptions, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { createFactoryExports } from "../factory/registry";
import { CHAIN } from "./chains";
import { addOneToken } from "./prices";
import * as sdk from '@defillama/sdk'

const event_pools_balance_change = "event PoolBalanceChanged(bytes32 indexed poolId,address indexed liquidityProvider,address[] tokens,int256[] deltas,uint256[] protocolFeeAmounts)"
const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const abis = {
  getPool: "function getPool(bytes32 poolId) view returns (address, uint8)",
  getSwapFeePercentage: "uint256:getSwapFeePercentage"
}

export async function getFees(vault: string, { createBalances, api, getLogs, }: FetchOptions) {
  const dailyFees = createBalances()
  const dailyVolume = createBalances()

  const logs_swap = await getLogs({ target: vault, eventAbi: event_swap, })
  const logs_balance = await getLogs({ target: vault, eventAbi: event_pools_balance_change, })
  const logs_flash_bot = await getLogs({ target: vault, eventAbi: event_flash_bot, })
  logs_balance.forEach((log: any) => dailyFees.add(log.tokens, log.protocolFeeAmounts))
  logs_flash_bot.forEach((log: any) => dailyFees.add(log.token, log.feeAmount))
  const poolIds = [...new Set(logs_swap.map((a: any) => a.poolId))]
  const pools = (await api.multiCall({ abi: abis.getPool, calls: poolIds, target: vault })).map(i => i[0])
  const swapFees = await api.multiCall({ abi: abis.getSwapFeePercentage, calls: pools, permitFailure: true })
  logs_swap.forEach((log: any) => {
    const index = poolIds.indexOf(log.poolId)
    if (index === -1) return;
    const fee = swapFees[index] ? swapFees[index] / 1e18 : 0
    dailyFees.add(log.tokenOut, Number(log.amountOut) * fee)
    addOneToken({ chain: api.chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.amountIn, amount1: log.amountOut })
  })

  return { dailyFees, dailyVolume }
}

export function getFeesExport(vault: string, { revenueRatio = 0, protocolRevenueRatio, holderRevenueRatio, }: { revenueRatio?: number, protocolRevenueRatio?: number, holderRevenueRatio?: number } = {}) {
  return (async (options) => {
    const { dailyFees, dailyVolume } = await getFees(vault, options)
    const { createBalances } = options
    const response: any = { dailyFees, dailyVolume, }

    if (revenueRatio) {
      const dailyRevenue = createBalances()
      const dailySupplySideRevenue = createBalances()
      dailyRevenue.addBalances(dailyFees)
      dailySupplySideRevenue.addBalances(dailyFees)
      dailyRevenue.resizeBy(revenueRatio)
      dailySupplySideRevenue.resizeBy(1 - revenueRatio)
      response.dailyRevenue = dailyRevenue
      response.dailySupplySideRevenue = dailySupplySideRevenue
    }
    if (protocolRevenueRatio) {
      response.dailyProtocolRevenue = response.dailyFees.clone(protocolRevenueRatio)
    }
    if (holderRevenueRatio) {
      response.dailyHoldersRevenue = response.dailyFees.clone(holderRevenueRatio)
    }
    return response
  }) as FetchV2
}


export function getGraphExport(graphEndpoint: string, { revenueRatio = 0 }: { revenueRatio?: number } = {}) {
  return (async ({ getEndBlock, getStartBlock, createBalances, }: FetchOptions) => {
    const { dailyFees, dailyVolume, } = await getDataGraph()
    const response: any = { dailyFees, dailyVolume, }

    if (revenueRatio) {
      const dailyRevenue = dailyFees.clone(revenueRatio)
      const dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio)
      response.dailyRevenue = dailyRevenue
      response.dailySupplySideRevenue = dailySupplySideRevenue
    }
    return response

    async function getDataGraph() {
      const blockNow = await getEndBlock()
      const blockYesterday = await getStartBlock()
      const graphQuery = `{
        today: balancers(block: { number: ${blockNow} }) {
          totalSwapFee   totalSwapVolume
        }
        yesterday: balancers(block: { number: ${blockYesterday} }) {
          totalSwapFee   totalSwapVolume
        }
      }`
      const graphRes = await sdk.graph.request(graphEndpoint, graphQuery)
      const dailyFees = createBalances()
      const dailyVolume = createBalances()
      graphRes.today.forEach((today: any, i: number) => {
        const yesterday = graphRes.yesterday[i]
        dailyFees.addUSDValue(+today.totalSwapFee - yesterday.totalSwapFee)
        dailyVolume.addUSDValue(today.totalSwapVolume - yesterday.totalSwapVolume)
      })
      return { dailyFees, dailyVolume, }
    }
  }) as FetchV2
}

type BalancerFeesChainConfig = {
  vault: string;
  start: string;
  revenueRatio?: number;
  protocolRevenueRatio?: number;
  holderRevenueRatio?: number;
}

function balancerFeesExports(config: IJSON<BalancerFeesChainConfig>, overrides?: Partial<SimpleAdapter>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getFeesExport(chainConfig.vault, {
        revenueRatio: chainConfig.revenueRatio,
        protocolRevenueRatio: chainConfig.protocolRevenueRatio,
        holderRevenueRatio: chainConfig.holderRevenueRatio,
      }),
      start: chainConfig.start,
    }
  })
  return { version: 2, adapter: exportObject, pullHourly: true, ...overrides } as SimpleAdapter
}

const balancerEntries: Record<string, any> = {
  // Fee adapters
  "beethoven-x": {
    [CHAIN.OPTIMISM]: { vault: '0xba12222222228d8ba445958a75a0704d566bf2c8', revenueRatio: 0.25, start: '2023-01-01' },
    [CHAIN.FANTOM]: { vault: '0x20dd72ed959b6147912c2e529f0a0c651c33c9ce', revenueRatio: 0.25, start: '2023-01-01' },
    [CHAIN.SONIC]: { vault: '0xba12222222228d8ba445958a75a0704d566bf2c8', revenueRatio: 0.25, start: '2024-12-14' },
  },
  sobal: {
    chainConfig: {
      [CHAIN.NEON]: { vault: '0x7122e35ceC2eED4A989D9b0A71998534A203972C', start: '2023-07-17' },
      [CHAIN.BASE]: { vault: '0x7122e35ceC2eED4A989D9b0A71998534A203972C', start: '2023-08-01' },
    },
    methodology: {
      UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
      Fees: "All trading fees collected (doesn't include withdrawal and flash loan fees)",
      Revenue: "Protocol revenue from all fees collected",
      ProtocolRevenue: "Currently no protocol swap fee in place",
      SupplySideRevenue: "A small percentage of the trade paid by traders to pool LPs, set by the pool creator or managed by protocol.",
    },
  },
  // Dex adapters
  ducata: {
    [CHAIN.ARBITRUM]: { vault: '0x25898DEe0634106C2FcBB51B3DB5b14aA1c238a4' },
  },
  embr: {
    [CHAIN.AVAX]: { vault: '0xad68ea482860cd7077a5d0684313dd3a9bc70fbb' },
  },
  "gaming-dex": {
    defiverse: { vault: '0x2FA699664752B34E90A414A42D62D7A8b2702B85' },
    [CHAIN.OAS]: { vault: '0xfb6f8FEdE0Cb63674Ab964affB93D65a4a7D55eA' },
  },
  phux: {
    [CHAIN.PULSECHAIN]: { vault: '0x7F51AC3df6A034273FB09BB29e383FCF655e473c' },
  },
  "polaris-fi": {
    [CHAIN.AURORA]: { vault: '0x6985436a0E5247A3E1dc29cdA9e1D89C5b59e26b' },
    [CHAIN.TELOS]: { vault: '0x9Ced3B4E4DC978265484d1F1f569010E13f911c9' },
  },
  tanukix: {
    [CHAIN.TAIKO]: { vault: '0x3251e99cEf4b9bA03a6434B767aa5Ad11ca6cc31' },
  },
  aequinox: {
    [CHAIN.BSC]: { vault: '0xee1c8dbfbf958484c6a4571f5fb7b99b74a54aa7' },
  },
  chimpexchange: {
    [CHAIN.LINEA]: { vault: '0x286381aEdd20e51f642fE4A200B5CB2Fe3729695' },
  },
  darkness: {
    [CHAIN.CRONOS]: { vault: '0x92631e0e84ff01853ef1bb88fc9c9f7d1e1af1ca' },
  },
  "hadouken-amm": {
    [CHAIN.GODWOKEN_V1]: { vault: '0x4f8bdf24826ebcf649658147756115ee867b7d63' },
  },
  "klex-finance": {
    [CHAIN.KLAYTN]: { vault: '0xb519Cf56C63F013B0320E89e1004A8DE8139dA27' },
  },
  koyo: {
    [CHAIN.BOBA]: { vault: '0x2a4409cc7d2ae7ca1e3d915337d1b6ba2350d6a3', start: '2022-06-13' },
  },
  mondrain: {
    [CHAIN.ABSTRACT]: { vault: '0x48cD08ad2065e0cD2dcD56434e393D55A59a4F64' },
  },
  "wavelength-dao": {
    [CHAIN.VELAS]: { vault: '0xa4a48dfcae6490afe9c779bf0f324b48683e488c', revenueRatio: 0.4, holderRevenueRatio: 0.3, protocolRevenueRatio: 0.1, start: '2022-10-20' },
  },
}

const protocols = {} as any;
Object.entries(balancerEntries).forEach(([protocolName, entry]: [string, any]) => {
  if (entry.chainConfig) {
    const { chainConfig, ...overrides } = entry
    protocols[protocolName] = balancerFeesExports(chainConfig, overrides)
  } else {
    protocols[protocolName] = balancerFeesExports(entry)
  }
})

export const { protocolList, getAdapter } = createFactoryExports(protocols);