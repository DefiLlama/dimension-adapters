import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { getConfig } from "../helpers/cache";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const methodology = {
  Fees: 'Total yields from deposited assets across all vaults',
  SupplySideRevenue: 'Total yields are distributed to depositors',
  Revenue: 'Performance and management fees to Yearn treasury',
  ProtocolRevenue: '10% of the performance and management fees go to Yearn treasury',
  HoldersRevenue: '90% of the protocol revenue goes to stYFI stakers since 2026-02-05'
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total yields from deposited assets across all vaults',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Total yields are distributed to depositors',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Performance fees to Yearn treasury',
    [METRIC.MANAGEMENT_FEES]: 'Management fees to Yearn treasury',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: '10% of the Performance fees go to Yearn treasury',
    [METRIC.MANAGEMENT_FEES]: '10% of the Management fees go to Yearn treasury',
  },
  HoldersRevenue: {
    [METRIC.ASSETS_YIELDS]: '90% of the Performance fees go to stYFI stakers',
    [METRIC.MANAGEMENT_FEES]: '90% of the Management fees to to stYFI stakers',
  },
}

const vaultListApi = (chainId: number) => `https://ydaemon.yearn.finance/vaults/all?chainids=${chainId}&limit=100000`

const YearnVaultsV1: Array<string> = [
  '0x597aD1e0c13Bfe8025993D9e79C69E1c0233522e',
  '0x5dbcF33D8c2E976c6b560249878e6F1491Bca25c',
  '0x37d19d1c4E1fa9DC47bD1eA12f742a0887eDa74a',
  '0xACd43E627e64355f1861cEC6d3a6688B31a6F952',
  '0x2f08119C6f07c006695E079AAFc638b8789FAf18',
  '0xBA2E7Fed597fd0E3e70f5130BcDbbFE06bB94fe1',
  '0x2994529C0652D127b7842094103715ec5299bBed',
  '0x7Ff566E1d69DEfF32a7b244aE7276b9f90e9D0f6',
  '0xe1237aA7f535b0CC33Fd973D66cBf830354D16c7',
  '0x9cA85572E6A3EbF24dEDd195623F188735A5179f',
  '0xec0d8D3ED5477106c6D4ea27D90a60e594693C90',
  '0x629c759D1E83eFbF63d84eb3868B564d9521C129',
  '0x0FCDAeDFb8A7DfDa2e9838564c5A1665d856AFDF',
  '0xcC7E70A958917cCe67B4B87a8C30E6297451aE98',
  '0x98B058b2CBacF5E99bC7012DF757ea7CFEbd35BC',
  '0xE0db48B4F71752C4bEf16De1DBD042B82976b8C7',
  '0x5334e150B938dd2b6bd040D9c4a03Cff0cED3765',
  '0xFe39Ce91437C76178665D64d7a2694B0f6f17fE3',
  '0xF6C9E9AF314982A4b38366f4AbfAa00595C5A6fC',
  '0xA8B1Cb4ed612ee179BDeA16CCa6Ba596321AE52D',
  '0x46AFc2dfBd1ea0c0760CAD8262A5838e803A37e5',
  '0x5533ed0a3b83F70c3c4a1f69Ef5546D3D4713E44',
  '0x8e6741b456a074F0Bc45B8b82A755d4aF7E965dF',
  '0x03403154afc09Ce8e44C3B185C82C6aD5f86b9ab',
  '0xE625F5923303f1CE7A43ACFEFd11fd12f30DbcA4',
  '0xBacB69571323575C6a5A3b4F9EEde1DC7D31FBc1',
  '0x1B5eb1173D2Bf770e50F10410C9a96F7a8eB6e75',
  '0x96Ea6AF74Af09522fCB4c28C269C26F59a31ced6',
]

const BlacklistVaults = [
  String('0xb0154f71912866Bb69fE26fFc44779D99B9CAE85').toLowerCase(),
];

const ContractAbis = {
  token: 'address:token',
  totalSupply: 'uint256:totalSupply',
  totalAssets: 'uint256:totalAssets',
  getPricePerFullShare: 'uint256:getPricePerFullShare',
  pricePerShare: 'uint256:pricePerShare',
  performanceFee: 'uint16:performanceFee',
  managementFee: 'uint16:managementFee',
  decimals: 'uint8:decimals',
}

const ChainIds: { [key: string]: number } = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.POLYGON]: 137,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BASE]: 8453,
}

interface IVault {
  vault: string;
  token: string;
  priceShareBefore: number;
  priceShareAfter: number;
  totalSupply: number;
  performanceFeeRate: number;
  managementFeeRate: number;
  decimals: number;
  isV1: boolean;
}

const stYFILaunch = 1770249600 // 2026-02-05

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const vaults: Array<IVault> = []

  // get v1 vaults data if any
  if (options.chain === CHAIN.ETHEREUM) {
    const vaultTokens = await options.api.multiCall({
      abi: ContractAbis.token,
      calls: YearnVaultsV1,
      permitFailure: true,
    })
    const vaultTotalSupply = await options.api.multiCall({
      abi: ContractAbis.totalSupply,
      calls: YearnVaultsV1,
      permitFailure: true,
    })
    const vaultPriceShareBefore = await options.fromApi.multiCall({
      abi: ContractAbis.getPricePerFullShare,
      calls: YearnVaultsV1,
      permitFailure: true,
    })
    const vaultPriceShareAfter = await options.toApi.multiCall({
      abi: ContractAbis.getPricePerFullShare,
      calls: YearnVaultsV1,
      permitFailure: true,
    })
    const vaultDecimals = await options.api.multiCall({
      abi: ContractAbis.decimals,
      calls: YearnVaultsV1,
      permitFailure: true,
    })

    if (vaultTokens) {
      for (let idx = 0; idx < YearnVaultsV1.length; idx++) {
        const token = vaultTokens[idx]
        const totalSupply = vaultTotalSupply[idx]
        const priceShareBefore = vaultPriceShareBefore[idx]
        const priceShareAfter = vaultPriceShareAfter[idx]

        if (token) {
          vaults.push({
            vault: YearnVaultsV1[idx],
            token: token,
            totalSupply,
            priceShareBefore: priceShareBefore,
            priceShareAfter: priceShareAfter,

            // v1 fees docs: https://github.com/yearn/yearn-docs/blob/master/yearn-finance/yvaults/overview.md
            performanceFeeRate: 0.2, // 20%
            managementFeeRate: 0.02, // 2% per year
            decimals: vaultDecimals[idx],
            isV1: true
          })
        }
      }
    }
  }

  // get v2, v3 vaults data
  const configs = await getConfig(`yearn/vaults-${options.chain}`, vaultListApi(ChainIds[options.chain]))
  const vaultTotalSupply = await options.api.multiCall({
    abi: ContractAbis.totalSupply,
    calls: configs.map((config: any) => config.address),
    permitFailure: true,
  })
  const vaultPerformanceFees = await options.api.multiCall({
    abi: ContractAbis.performanceFee,
    calls: configs.map((config: any) => config.address),
    permitFailure: true,
  })
  const vaultManagementFees = await options.api.multiCall({
    abi: ContractAbis.managementFee,
    calls: configs.map((config: any) => config.address),
    permitFailure: true,
  })
  const vaultPriceShareBefore = await options.fromApi.multiCall({
    abi: ContractAbis.pricePerShare,
    calls: configs.map((config: any) => config.address),
    permitFailure: true,
  })
  const vaultPriceShareAfter = await options.toApi.multiCall({
    abi: ContractAbis.pricePerShare,
    calls: configs.map((config: any) => config.address),
    permitFailure: true,
  })
  const vaultDecimals = await options.api.multiCall({
    abi: ContractAbis.decimals,
    calls: configs.map((config: any) => config.address),
    permitFailure: true,
  })
  if (vaultTotalSupply) {
    for (let idx = 0; idx < configs.length; idx++) {
      const token = configs[idx].token.address
      const totalSupply = vaultTotalSupply[idx]
      const priceShareBefore = vaultPriceShareBefore[idx]
      const priceShareAfter = vaultPriceShareAfter[idx]
      const performanceFeesRate = vaultPerformanceFees[idx]

      vaults.push({
        vault: configs[idx].address,
        token: token,
        totalSupply,
        priceShareBefore: priceShareBefore,
        priceShareAfter: priceShareAfter,
        performanceFeeRate: Number(performanceFeesRate) / 1e4,
        managementFeeRate: vaultManagementFees[idx] ? Number(vaultManagementFees[idx]) / 1e4 : 0,
        decimals: vaultDecimals[idx],
        isV1: false,
      })
    }
  }

  // sum fees
  for (const vault of vaults) {
    if (BlacklistVaults.includes(vault.vault.toLowerCase())) {
      continue;
    }

    const priceShareGrowth = vault.priceShareAfter - vault.priceShareBefore
    const priceDecimals = vault.isV1 ? 18 : vault.decimals;
    const tf = vault.totalSupply * priceShareGrowth / (10 ** priceDecimals)

    const performanceFees = tf * vault.performanceFeeRate
    const managementFees = tf * vault.managementFeeRate
    const protocolFees = performanceFees + managementFees

    dailyFees.add(vault.token, tf, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.add(vault.token, tf - protocolFees, METRIC.ASSETS_YIELDS)
    dailyProtocolRevenue.add(vault.token, performanceFees, METRIC.ASSETS_YIELDS)
    dailyProtocolRevenue.add(vault.token, managementFees, METRIC.MANAGEMENT_FEES)
  }
  if (options.fromTimestamp >= stYFILaunch) {
    dailyHoldersRevenue.addBalances(dailyProtocolRevenue)
    dailyProtocolRevenue.resizeBy(0.1)
    dailyHoldersRevenue.resizeBy(0.9)
  }
  const dailyRevenue = dailyProtocolRevenue.clone()
  dailyRevenue.addBalances(dailyHoldersRevenue)

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue
  }
}

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  fetch,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2020-07-27', },
    [CHAIN.POLYGON]: { start: '2024-01-01', },
    [CHAIN.OPTIMISM]: { start: '2024-01-01', },
    [CHAIN.ARBITRUM]: { start: '2024-01-01', },
    [CHAIN.BASE]: { start: '2024-01-01', },
  },
};

export default adapter;
