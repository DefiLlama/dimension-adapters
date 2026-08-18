import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { ABI, EulerConfigs, MorphoConfigs } from "./configs";
import { CHAIN } from "../chains";
import fetchURL from "../../utils/fetchURL";

const KAMINO_API = 'https://api.kamino.finance';
const YEAR_SECS = 365 * 24 * 60 * 60;

const METRICS = {
  // use this label for all yield sources if breakdownFees was not set
  AssetYields: 'Assets Yields',
  
  // set 
  OtherAssetYields: 'Other Asset Yields',
  OtherAssetYieldsToSuppliers: 'Other Asset Yields Distributed To Supliers',
  OtherAssetYieldsToCurator: 'Other Asset Yields To Curator',
  MorphoYields: 'Morpho Yields',
  MorphoYieldsToSuppliers: 'Morpho Yields Distributed To Supliers',
  MorphoPerformanceFee: 'Morpho Performance Fees',
  MorphoManagementFee: 'Morpho Management Fees',
  EulerYields: 'Euler Yields',
  EulerYieldsToSuppliers: 'Euler Yields Distributed To Supliers',
  EulerPerformanceFee: 'Euler Performance Fees',
  KaminoYields: 'Kamino Yields',
  KaminoYieldsToSuppliers: 'Kamino Yields Distributed To Supliers',
  KaminoPerformanceFee: 'Kamino Performance Fees',
  KaminoManagementFee: 'Kamino Management Fees',
}

export interface CuratorConfig {
  methodology?: any;
  breakdownFees?: boolean;
  vaults: {
    // chain => 
    [key: string]: {
      start?: string;
      morpho?: Array<string>;
      morphoV2?: Array<string>;
      euler?: Array<string>;

      // initial owner of morpho vaults
      morphoVaultOwners?: Array<string>;
      morphoVaultV2Owners?: Array<string>;

      // creators of euler vaults
      eulerVaultOwners?: Array<string>;

      // Kamino kvault addresses (Solana). Curated vaults are attributed by
      // vaultAdminAuthority off-chain; only the confirmed addresses are listed.
      kaminoVaults?: Array<string>;
    }
  }
}

interface Balances {
  dailyFees: sdk.Balances;
  dailyRevenue: sdk.Balances;
  dailySupplySideRevenue: sdk.Balances;
}

interface VaultERC4626Info {
  vault: string;
  asset: string;
  assetDecimals: number;
  balance: bigint;
  rateBefore: bigint;
  rateAfter: bigint;
}

const blacklistedTokens: Record<string, Array<{ token: string, from: string }>> = {
  [CHAIN.ETHEREUM]: [{
    token: '0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559', //wUSDL - winded down
    from: "2025-12-08",
  }],
}

// vaults excluded entirely from a given date onwards. used when a vault's share price is corrupted
// (e.g. an allocated market frozen at 100% utilization accrues phantom interest, or a pending bad-debt
// write-off would otherwise show up as a fake large negative day). the adapter only reads vault-level
// share price, so a single bad market cannot be isolated - the whole vault has to be dropped.
const blacklistedVaults: Record<string, Array<{ vault: string, from: string }>> = {
  [CHAIN.ETHEREUM]: [{
    // Clearstar Yield USDC (CSYUSDC) - allocated RLP/USDC market frozen at 100% utilization, accruing phantom
    // interest that inflated reported yield from ~$281/day to ~$197k/day. vault now deprecated with unrealized
    // bad debt; excluding from the freeze onset also keeps the eventual write-off out of the series.
    vault: '0x9B5E92fd227876b4C07a8c02367E2CB23c639DfA',
    from: '2026-03-21',
  }, {
    // Clearstar Yield USDC v2 (0xFa17...F853) - the v2 vault of the same name, allocated to the same
    // frozen market. Share price ran 1.009084 -> 1.019572 over 2026-03-21..04-04 and 1.794800 ->
    // 1.908595 over the last week alone, ~165% APR against ~5.2% before the freeze, on a USDC vault
    // that has now marked itself up 91%. Same phantom accrual as the v1 above, same onset date.
    vault: '0xFa17f7AAdbfAc2C5d3C8125555404c1AE17Df853',
    from: '2026-03-21',
  }, {
    // MEV Capital Elixir USDC - share price 95.38 -> 97.33 in one day (~71,000% APR) on ~$460k
    // TVL, reporting ~$894k fees/day. Frozen/unrealized bad debt after the Nov 2025 Elixir deUSD
    // unwind; phantom accrual compounds from early April 2026.
    vault: '0x1265a81d42d513Df40d0031f8f2e1346954d665a',
    from: '2026-04-01',
  }, {
    // MEV Capital USD0 - share price 7.73 -> 7.82 in one day (~3,300% APR) on ~$217k TVL,
    // reporting ~$20k fees/day. Same vault-level share-price corruption.
    vault: '0x749794E985Af5a9A384B9cEe6D88DaB4CE1576A1',
    from: '2026-04-01',
  }],
}

function isOwner(owner: string, owners: Array<string>) {
  for (const item of owners) {
    if (String(item).toLowerCase() === String(owner).toLowerCase()) {
      return true
    }
  }
  return false
}

async function getMorphoVaults(options: FetchOptions, vaults: Array<string> | undefined, owners: Array<string> | undefined): Promise<Array<string>> {
  let morphoVaults = vaults ? vaults : []

  if (owners && owners.length > 0) {
    for (const factory of MorphoConfigs[options.chain].vaultFactories) {
      const logs = await options.getLogs({
        eventAbi: ABI.morpho.CreateMetaMorphoEvent,
        target: factory.address,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      })
      const vaultOfOwners = logs.filter(log => isOwner(log.initialOwner, owners)).map((log) => log.metaMorpho)
      morphoVaults = morphoVaults.concat(vaultOfOwners)
    }
  }

  return morphoVaults
}

async function getMorphoVaultsV2(options: FetchOptions, vaults: Array<string> | undefined, owners: Array<string> | undefined): Promise<Array<string>> {
  let morphoVaults = vaults ? vaults : []

  if (owners && owners.length > 0) {
    for (const factory of MorphoConfigs[options.chain].vaultV2Factories) {
      const logs = await options.getLogs({
        eventAbi: ABI.morpho.CreateVaultV2,
        target: factory.address,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      })
      const vaultOfOwners = logs.filter(log => isOwner(log.owner, owners)).map((log) => log.newVaultV2)
      morphoVaults = morphoVaults.concat(vaultOfOwners)
    }
  }
  
  return morphoVaults
}

async function getEulerVaults(options: FetchOptions, vaults: Array<string> | undefined, owners: Array<string> | undefined): Promise<Array<string>> {
  let eulerVaults = vaults ? vaults : []

  const blacklistedVaults = EulerConfigs[options.chain] && EulerConfigs[options.chain].blacklistedVaults ? EulerConfigs[options.chain].blacklistedVaults : []

  if (owners && owners.length > 0) {
    for (const factory of EulerConfigs[options.chain].vaultFactories) {
      const getProxyListLength = await options.api.call({
        abi: ABI.euler.getProxyListLength,
        target: factory,
        permitFailure: true,
      });
      if (getProxyListLength) {
        const lists = []
        for (let i = 0; i < Number(getProxyListLength); i++) {
          lists.push(i);
        }
        const proxyAddresses = await options.api.multiCall({
          abi: ABI.euler.proxyList,
          calls: lists.map(index => {
            return {
              target: factory,
              params: [index],
            }
          }),
        })
        const proxyCreators = await options.api.multiCall({
          abi: ABI.euler.creator,
          calls: proxyAddresses,
        });
        for (let i = 0; i < proxyAddresses.length; i++) {
          if (isOwner(proxyCreators[i], owners)) {
            if (blacklistedVaults.includes(proxyAddresses[i].toLowerCase())) {
              continue
            }
            eulerVaults.push(proxyAddresses[i])
          }
        }
      }
    }
  }

  return eulerVaults
}

async function getVaultERC4626Info(options: FetchOptions, vaults: Array<string>, decimalAdjustment?: boolean): Promise<Array<VaultERC4626Info>> {
  const vaultInfo: Array<VaultERC4626Info> = []

  const assets = await options.fromApi.multiCall({
    abi: ABI.ERC4626.asset,
    calls: vaults,
    permitFailure: true,
  });
  const decimals = await options.fromApi.multiCall({
    abi: ABI.ERC4626.decimals,
    calls: assets.map(item => item ? item : ''),
    permitFailure: true,
  });
  const balances = await options.fromApi.multiCall({
    abi: ABI.ERC4626.totalAssets,
    calls: vaults,
    permitFailure: true,
  });
  const ratesBefore = await options.fromApi.multiCall({
    abi: ABI.ERC4626.converttoAssets,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
    permitFailure: true,
  });
  const ratesAfter = await options.toApi.multiCall({
    abi: ABI.ERC4626.converttoAssets,
    calls: vaults.map(vault => {
      return {
        target: vault,
        params: ['1000000000000000000'],
      }
    }),
    permitFailure: true,
  });
  for (let i = 0; i < vaults.length; i++) {
    const asset = assets[i]
    if (asset) {
      const assetDecimals = Number(decimals[i]);
      const denominator = decimalAdjustment ? 10 ** (18 - assetDecimals) : 1;
      
      vaultInfo.push({
        vault: vaults[i],
        asset,
        assetDecimals: Number(decimals[i]),
        balance: BigInt(balances[i] ? balances[i] : 0),
        rateBefore: BigInt(ratesBefore[i] ? ratesBefore[i] : 0) * BigInt(denominator),
        rateAfter: BigInt(ratesAfter[i] ? ratesAfter[i] : 0) * BigInt(denominator),
      })
    }
  }

  return vaultInfo;
}

async function getMorphoVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  const vaultInfo = await getVaultERC4626Info(options, vaults, true)
  const vaultFeeRates = await options.api.multiCall({
    abi: ABI.morpho.fee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    const vaultFeeRate = BigInt(vaultFeeRates[i] ? vaultFeeRates[i] : 0)

    // morpho vault include fee directly to vault shares
    // it mean that vault fees were added from vault token shares

    // interest earned and distributed to vault deposited including fees
    const interestEarnedIncludingFees = vaultInfo[i].balance * growthRate / BigInt(10**18)
    
    // interest earned by vault curator
    const interestFee = interestEarnedIncludingFees * vaultFeeRate / BigInt(1e18)

    if (breakdownFees) {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.MorphoYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.MorphoPerformanceFee)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees- interestFee, METRICS.MorphoYieldsToSuppliers)
    } else {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.AssetYields)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees- interestFee, METRICS.AssetYields)
    }
  }
}

export async function getEulerVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  const vaultInfo = await getVaultERC4626Info(options, vaults)
  const vaultFeeRates = await options.api.multiCall({
    abi: ABI.euler.interestFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })

  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    const vaultFeeRate = BigInt(vaultFeeRates[i] ? vaultFeeRates[i] : 0)

    // euler vault subtract fee directly from interest when collecting
    // it mean that vault fees were remove from vault token shares

    // interest earned and distributed to vault deposited after fees
    const interestEarned = vaultInfo[i].balance * growthRate / BigInt(1e18)
    
    // interest earned and distributed to vault deposited and vault curator before fees
    let interestEarnedBeforeFee = interestEarned
    if (vaultFeeRate < BigInt(1e4)) {
      interestEarnedBeforeFee = interestEarned * BigInt(1e4) / (BigInt(1e4) - vaultFeeRate)
    }

    // interest earned by vault curator
    const interestFee = interestEarnedBeforeFee - interestEarned

    if (breakdownFees) {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedBeforeFee, METRICS.EulerYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.EulerPerformanceFee)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedBeforeFee - interestFee, METRICS.EulerYieldsToSuppliers)
    } else {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedBeforeFee, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestFee, METRICS.AssetYields)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedBeforeFee - interestFee, METRICS.AssetYields)
    }
  }
}

// Kamino kvaults (Solana). Mirrors the accounting in fees/sentora.ts: the vault's
// cumulative `interest` metric is read at the window bounds and the delta is the
// gross yield; the performance fee (performanceFeeBps) is curator revenue, the
// rest is supply side. Management fee (managementFeeBps) accrues per-second on AUM.
export async function getKaminoVaultFee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  if (!vaults.length) return

  const startDate = new Date((options.fromTimestamp - 86400) * 1000).toISOString().split('T')[0]
  const endDate = new Date((options.toTimestamp + 86400) * 1000).toISOString().split('T')[0]
  const elapsed = options.toTimestamp - options.fromTimestamp

  for (const vault of vaults) {
    const [config, history] = await Promise.all([
      fetchURL(`${KAMINO_API}/kvaults/vaults/${vault}`),
      fetchURL(`${KAMINO_API}/kvaults/vaults/${vault}/metrics/history?start=${startDate}&end=${endDate}`),
    ])

    const state = config?.state
    if (!state?.tokenMint) continue

    const tokenMint = state.tokenMint as string
    const decimals = Number(state.tokenMintDecimals ?? 0) || 6
    const perfFeeRate = Number(state.performanceFeeBps ?? 0) / 1e4
    const mgmtFeeRate = Number(state.managementFeeBps ?? 0) / 1e4

    // History is requested with a ±1 day pad (API is date-grained); keep only
    // snapshots that fall inside this fetch window.
    const points: any[] = (Array.isArray(history) ? history : history?.history ?? [])
      .map((p: any) => ({ ...p, _ts: Date.parse(p.timestamp ?? p.date ?? '') / 1000 }))
      .filter((p: any) => isFinite(p._ts) && p._ts >= options.fromTimestamp && p._ts <= options.toTimestamp)
      .sort((a: any, b: any) => a._ts - b._ts)

    let grossInterest = 0
    if (points.length >= 2) {
      // `interest` is cumulative since inception, so the window yield is last - first.
      const delta = Number(points[points.length - 1].interest ?? 0) - Number(points[0].interest ?? 0)
      if (delta > 0) grossInterest = delta * 10 ** decimals
    }

    const perfFee = grossInterest * perfFeeRate
    // History `tvl` and `interest` are human-denominated; scale both to raw units.
    // Use the first in-window snapshot so mgmt fee tracks that day's AUM, not live prevAum.
    const tvl = Number(points[0]?.tvl ?? 0)
    const mgmtFee = tvl * 10 ** decimals * mgmtFeeRate * elapsed / YEAR_SECS

    if (grossInterest > 0) {
      if (breakdownFees) {
        balances.dailyFees.add(tokenMint, grossInterest, METRICS.KaminoYields)
        balances.dailyRevenue.add(tokenMint, perfFee, METRICS.KaminoPerformanceFee)
        balances.dailySupplySideRevenue.add(tokenMint, grossInterest - perfFee, METRICS.KaminoYieldsToSuppliers)
      } else {
        balances.dailyFees.add(tokenMint, grossInterest, METRICS.AssetYields)
        balances.dailyRevenue.add(tokenMint, perfFee, METRICS.AssetYields)
        balances.dailySupplySideRevenue.add(tokenMint, grossInterest - perfFee, METRICS.AssetYields)
      }
    }
    if (mgmtFee > 0) {
      const label = breakdownFees ? METRICS.KaminoManagementFee : METRICS.AssetYields
      balances.dailyFees.add(tokenMint, mgmtFee, label)
      balances.dailyRevenue.add(tokenMint, mgmtFee, label)
    }
  }
}

async function getMorphoVaultV2Fee(options: FetchOptions, balances: Balances, vaults: Array<string>, breakdownFees?: boolean) {
  const vaultInfo = await getVaultERC4626Info(options, vaults, true)
  const vaultPerformanceFeeRates = await options.api.multiCall({
    abi: ABI.morpho.performanceFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })
  const vaultManagementFeeRates = await options.api.multiCall({
    abi: ABI.morpho.managementFee,
    calls: vaultInfo.map(item => item.vault),
    permitFailure: true,
  })
  
  for (let i = 0; i < vaultInfo.length; i++) {
    const growthRate = vaultInfo[i].rateAfter - vaultInfo[i].rateBefore

    const vaultPerformanceFeeRate = BigInt(vaultPerformanceFeeRates[i] ? vaultPerformanceFeeRates[i] : 0)
    const vaultManagementFeeRate = BigInt(vaultManagementFeeRates[i] ? vaultManagementFeeRates[i] : 0)
    
    // morpho vault include fee directly to vault shares
    // it mean that vault fees were added from vault token shares

    // interest earned and distributed to vault deposited including fees
    const interestEarnedIncludingFees = vaultInfo[i].balance * growthRate / BigInt(10**18)
    
    // interest earned by vault curator - performance fee
    const interestPerformanceFee = interestEarnedIncludingFees * vaultPerformanceFeeRate / BigInt(1e18)
    
    // management fee earned by vault curator on principal
    const timeElapsed = options.toTimestamp - options.fromTimestamp
    const managementFeesEarned = vaultInfo[i].balance * vaultManagementFeeRate * BigInt(timeElapsed) / BigInt(1e18)

    if (breakdownFees) {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.MorphoYields)
      balances.dailyFees.add(vaultInfo[i].asset, managementFeesEarned, METRICS.MorphoManagementFee)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestPerformanceFee, METRICS.MorphoPerformanceFee)
      balances.dailyRevenue.add(vaultInfo[i].asset, managementFeesEarned, METRICS.MorphoManagementFee)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees - interestPerformanceFee, METRICS.MorphoYieldsToSuppliers)
    } else {
      balances.dailyFees.add(vaultInfo[i].asset, interestEarnedIncludingFees, METRICS.AssetYields)
      balances.dailyFees.add(vaultInfo[i].asset, managementFeesEarned, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, interestPerformanceFee, METRICS.AssetYields)
      balances.dailyRevenue.add(vaultInfo[i].asset, managementFeesEarned, METRICS.AssetYields)
      balances.dailySupplySideRevenue.add(vaultInfo[i].asset, interestEarnedIncludingFees - interestPerformanceFee, METRICS.AssetYields)
    }
  }
}

export function getCuratorExport(curatorConfig: CuratorConfig): SimpleAdapter {
  const methodology = curatorConfig.methodology ? curatorConfig.methodology :  {
    Fees: 'Total yields from deposited assets in all curated vaults.',
    Revenue: 'Yields are collected by curators.',
    ProtocolRevenue: 'Yields are collected by curators.',
    SupplySideRevenue: 'Yields are distributed to vaults depositors/investors.',
  }
  const breakdownMethodology = {
    Fees: {
      [METRICS.AssetYields]: 'Interest yields generated from deposited assets in all curated vaults, including both curator fees and depositor yields',
      [METRICS.MorphoYields]: 'Interest yields generated from deposited assets in Morpho',
      [METRICS.MorphoManagementFee]: 'Management fees charged on assets deposited in Morpho vaults',
      [METRICS.EulerYields]: 'Interest yields generated from deposited assets in Euler',
      [METRICS.KaminoYields]: 'Interest yields generated from deposited assets in Kamino kvaults',
      [METRICS.KaminoManagementFee]: 'Management fees charged on assets deposited in Kamino kvaults',
    },
    Revenue: {
      [METRICS.AssetYields]: 'Portion of interest yields retained by vault curators as management and performance fees',
      [METRICS.MorphoPerformanceFee]: 'Performance fees charged from vaults in Morpho',
      [METRICS.MorphoManagementFee]: 'Management fees charged from vaults in Morpho',
      [METRICS.EulerPerformanceFee]: 'Performance fees charged from vaults in Euler',
      [METRICS.KaminoPerformanceFee]: 'Performance fees charged from Kamino kvaults',
      [METRICS.KaminoManagementFee]: 'Management fees charged from Kamino kvaults',
    },
    SupplySideRevenue: {
      [METRICS.AssetYields]: 'Portion of interest yields distributed to vault depositors/investors after curator fees are deducted',
      [METRICS.MorphoYieldsToSuppliers]: 'Interest yields generated from deposited assets in Morpho distributed to suppliers',
      [METRICS.EulerYieldsToSuppliers]: 'Interest yields generated from deposited assets in Euler distributed to suppliers',
      [METRICS.KaminoYieldsToSuppliers]: 'Interest yields from Kamino kvaults distributed to suppliers',
    },
  }
  const exportObject: BaseAdapter = {}

  Object.entries(curatorConfig.vaults).map(([chain, vaults]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyRevenue = options.createBalances()
        let dailySupplySideRevenue = options.createBalances()

        // vaults blacklisted from this date onwards (corrupted share price / pending write-off)
        const blacklistedVaultsForChain = new Set(
          blacklistedVaults[options.chain]?.filter(item => options.dateString >= item.from).map(item => item.vault.toLowerCase())
        )
        const isBlacklistedVault = (vault: string) => blacklistedVaultsForChain.has(vault.toLowerCase())

        // morpho meta vaults
        const morphoVaults = (await getMorphoVaults(options, vaults.morpho, vaults.morphoVaultOwners)).filter(vault => !isBlacklistedVault(vault));

        // morpho v2 vaults
        const morphoVaultsV2 = (await getMorphoVaultsV2(options, vaults.morphoV2, vaults.morphoVaultV2Owners)).filter(vault => !isBlacklistedVault(vault));

        const eulerVaults = (await getEulerVaults(options, vaults.euler, vaults.eulerVaultOwners)).filter(vault => !isBlacklistedVault(vault));

        if (morphoVaults.length > 0) {
          await getMorphoVaultFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, morphoVaults, curatorConfig.breakdownFees)
        }
        if (morphoVaultsV2.length > 0) {
          await getMorphoVaultV2Fee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, morphoVaultsV2, curatorConfig.breakdownFees)
        }
        if (eulerVaults.length > 0) {
          await getEulerVaultFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, eulerVaults, curatorConfig.breakdownFees)
        }
        if (vaults.kaminoVaults && vaults.kaminoVaults.length > 0) {
          await getKaminoVaultFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, vaults.kaminoVaults, curatorConfig.breakdownFees)
        }

        const blacklistedTokensForChain = blacklistedTokens[options.chain]?.filter(token => options.dateString >= token.from)?.map(token => token.token)

        if (blacklistedTokensForChain && blacklistedTokensForChain.length > 0) {
          for (const token of blacklistedTokensForChain) {
            dailyFees.removeTokenBalance(token)
            dailyRevenue.removeTokenBalance(token)
            dailySupplySideRevenue.removeTokenBalance(token)
          }
        }

        return {
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue: dailyRevenue,
          dailySupplySideRevenue,
        }
      }),
      start: vaults.start,
    }
  })

  return {
    version: 2,
    methodology,
    breakdownMethodology,
    adapter: exportObject,
    allowNegativeValue: true, // we allow negative fees for vaults because vaults can make yields or make loss too
  }
}
