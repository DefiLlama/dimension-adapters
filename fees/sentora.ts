import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { ABI } from "../helpers/curators/configs"
import { getConfig } from "../helpers/cache"
import fetchURL from "../utils/fetchURL"

const SENTORA_API = 'https://services.vaults.sentora.com/vaults'
const KAMINO_API = 'https://api.kamino.finance'
const UPSHIFT_API = 'https://api.upshift.finance/v1/tokenized_vaults'

// Sentora takes 20% of the Veda BoringVault perf fee; the remaining 80% is counted in fees/veda.ts.
const SENTORA_BORING_PERF_SHARE = 0.20

// Uniform 10% Sentora perf fee on Euler v2 vaults (per Sentora dashboard).
const SENTORA_EULER_PERF_RATE = 0.10

// Sentora charges 10% performance on the EtherFi supervised-loan (leveraged weETH) strategies.
const SENTORA_SUPERVISED_PERF_RATE = 0.10

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WEETH = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee'

const ONE_SHARE = String(1e18)
const FEE_BASE_4 = 1e4
const YEAR_SECS = 365 * 24 * 60 * 60

const toNum = (v: any): number => Number(v ?? 0)
const sumLogs = (logs: any[], field: string): number => {
  let sum = 0
  for (const log of logs) sum += toNum(log[field])
  return sum
}

const CHAIN_MAP: Record<string, string> = {
  '1': CHAIN.ETHEREUM,
  'Solana': CHAIN.SOLANA,
}

const KAMINO_VAULT_BLOCKLIST = new Set([
  '2tmMcVv2Ene7wFGebPivhwYhAZyjaJoibMz1GYVaXsB1', // Sentora JitoSOL
])

// Veda BoringVaults curated by Sentora — not exposed in the Sentora API.
const BORING_VAULTS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0x9761ddf8e79930b334f1be1bd93abe3695061cca', // Kraken Earn USD
    '0x7dee0120739b7ec048b469939efb178adbbb19b2', // Kraken Earn BTC
    '0xdbd87325d7b1189dcc9255c4926076ff4a96a271', // Boosted USDC
    '0xcaae49fb7f74ccfbe8a05e6104b01c097a78789f', // Balanced USDC
    '0x13cc1b39cb259ba10cd174eae42012e698ed7c51', // Lombard
    '0x63d124cf1afc22f0ccea376168200508d2a0868e', // Kraken beHolder USD
    '0xf15351a0d66743e09457c45eae88df34fcee8cb7', // Kraken beHolder ETH (Sentora Advanced Yields ETH)
    '0x69d210d3b60e939bfa6e87cccc4fab7e8f44c16b', // Ether.fi Liquid Katana ETH
  ],
  [CHAIN.INK]: [
    '0x9761ddf8e79930b334f1be1bd93abe3695061cca',
    '0x7dee0120739b7ec048b469939efb178adbbb19b2',
    '0xdbd87325d7b1189dcc9255c4926076ff4a96a271',
    '0xcaae49fb7f74ccfbe8a05e6104b01c097a78789f',
  ],
}

// EtherFi supervised-loan Loan Managers (weETH collateral on Morpho, borrowing PYUSD/RLUSD).
// Not exposed in the Sentora API; addresses provided by Sentora. Kraken supervised loans are
// already captured via their BoringVault accountant above.
const SUPERVISED_LOAN_MANAGERS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0x64423e2f6b35d24f35e3fa3938d9b896004776b1',
    '0x268e5e8ee954016964e59c093d8deaee0245424c',
    '0xc936e848688c9f035fa0e7a0e4dbcf26a01245f3',
  ],
}

const L = {
  morphoYields: 'Morpho Yields',
  morphoSupply: 'Morpho Yields Distributed To Suppliers',
  morphoPerf: 'Morpho Performance Fees',
  morphoMgmt: 'Morpho Management Fees',
  eulerYields: 'Euler Yields',
  eulerSupply: 'Euler Yields Distributed To Suppliers',
  eulerPerf: 'Euler Performance Fees',
  boringYields: 'BoringVault Yields',
  boringSupply: 'BoringVault Yields Distributed To Suppliers',
  boringPerf: 'BoringVault Performance Fees',
  upshiftYields: 'Upshift Yields',
  upshiftSupply: 'Upshift Yields Distributed To Suppliers',
  upshiftPerf: 'Upshift Performance Fees',
  kaminoYields: 'Kamino Yields',
  kaminoSupply: 'Kamino Yields Distributed To Suppliers',
  kaminoPerf: 'Kamino Performance Fees',
  kaminoMgmt: 'Kamino Management Fees',
  supervisedYields: 'Supervised Loan Yields',
  supervisedSupply: 'Supervised Loan Yields Distributed To Suppliers',
  supervisedPerf: 'Supervised Loan Performance Fees',
}

const waivedByDate = (until: any, nowSeconds: number): boolean => {
  if (!until) return false
  const ts = Date.parse(until) / 1000
  return !isNaN(ts) && ts > nowSeconds
}

const ABIS = {
  morphoV1Accrue: 'event AccrueInterest(uint256 newTotalAssets, uint256 feeShares)',
  morphoV2Accrue: 'event AccrueInterest(uint256 previousTotalAssets, uint256 newTotalAssets, uint256 performanceFeeShares, uint256 managementFeeShares)',
  boringHook: 'address:hook',
  boringAccountant: 'address:accountant',
  boringBase: 'address:base',
  boringRate: 'uint256:getRate',
  // V1 accountantState has no perf fee slot; V2 exposes perfFeeRate at index 11.
  boringStateV1: 'function accountantState() view returns(address,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint32,uint16)',
  boringStateV2: 'function accountantState() view returns(address,uint96,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint24,uint16,uint16)',
}

type Balances = {
  dailyFees: ReturnType<FetchOptions['createBalances']>
  dailyRevenue: ReturnType<FetchOptions['createBalances']>
  dailySupplySideRevenue: ReturnType<FetchOptions['createBalances']>
}

type VaultRate = {
  vault: string
  asset: string
  totalAssets: number
  growthRatio: number
}

async function readVaultRates(options: FetchOptions, vaults: string[]): Promise<VaultRate[]> {
  if (!vaults.length) return []
  const rateCalls = vaults.map(target => ({ target, params: [ONE_SHARE] }))
  // permitFailure: vaults are enumerated from the current API, so on historical dates some
  // did not exist yet — let those reads fail softly and the guard below skips them.
  const [assets, totalAssets, ratesFrom, ratesTo] = await Promise.all([
    options.fromApi.multiCall({ abi: ABI.ERC4626.asset, calls: vaults, permitFailure: true }),
    options.fromApi.multiCall({ abi: ABI.ERC4626.totalAssets, calls: vaults, permitFailure: true }),
    options.fromApi.multiCall({ abi: ABI.ERC4626.converttoAssets, calls: rateCalls, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.ERC4626.converttoAssets, calls: rateCalls, permitFailure: true }),
  ])
  const result: VaultRate[] = []
  for (let i = 0; i < vaults.length; i++) {
    const before = toNum(ratesFrom[i])
    const after = toNum(ratesTo[i])
    if (!assets[i] || before <= 0) continue
    result.push({
      vault: vaults[i],
      asset: assets[i],
      totalAssets: toNum(totalAssets[i]),
      growthRatio: (after - before) / before,
    })
  }
  return result
}

async function convertSharesToAssets(options: FetchOptions, items: { vault: string; shares: number }[]): Promise<number[]> {
  if (!items.length) return []
  const calls = items.map(i => ({ target: i.vault, params: [String(BigInt(Math.floor(i.shares)))] }))
  const assets = await options.toApi.multiCall({ abi: ABI.ERC4626.converttoAssets, calls })
  return assets.map(toNum)
}

function boringPerfFeeRate(stateV1: any, stateV2: any): number | null {
  if (stateV2) return toNum(stateV2[11]) / FEE_BASE_4
  if (stateV1) return 0
  return null
}

async function accrueMorpho(options: FetchOptions, balances: Balances, vaults: string[]) {
  const rates = await readVaultRates(options, vaults)
  if (!rates.length) return

  const targets = rates.map(v => v.vault)
  const [v1LogsPerVault, v2LogsPerVault] = await Promise.all([
    options.getLogs({ eventAbi: ABIS.morphoV1Accrue, targets, cacheInCloud: true, flatten: false }),
    options.getLogs({ eventAbi: ABIS.morphoV2Accrue, targets, cacheInCloud: true, flatten: false }),
  ])

  const perfShares: { vault: string; shares: number }[] = []
  const mgmtShares: { vault: string; shares: number }[] = []
  for (let i = 0; i < rates.length; i++) {
    const v1Logs = v1LogsPerVault[i] ?? []
    const v2Logs = v2LogsPerVault[i] ?? []
    const perf = sumLogs(v1Logs, 'feeShares') + sumLogs(v2Logs, 'performanceFeeShares')
    const mgmt = sumLogs(v2Logs, 'managementFeeShares')
    perfShares.push({ vault: rates[i].vault, shares: perf })
    mgmtShares.push({ vault: rates[i].vault, shares: mgmt })
  }

  const [perfAssets, mgmtAssets] = await Promise.all([
    convertSharesToAssets(options, perfShares),
    convertSharesToAssets(options, mgmtShares),
  ])

  for (let i = 0; i < rates.length; i++) {
    const v = rates[i]
    // Share-price growth is net of curator fees (fee shares dilute price) → gross = supplier + perf + mgmt.
    const netYield = v.growthRatio > 0 ? v.totalAssets * v.growthRatio : 0
    const perf = perfAssets[i]
    const mgmt = mgmtAssets[i]
    const grossYield = netYield + perf + mgmt
    balances.dailyFees.add(v.asset, grossYield, L.morphoYields)
    if (perf > 0) balances.dailyRevenue.add(v.asset, perf, L.morphoPerf)
    if (mgmt > 0) balances.dailyRevenue.add(v.asset, mgmt, L.morphoMgmt)
    balances.dailySupplySideRevenue.add(v.asset, netYield, L.morphoSupply)
  }
}

async function accrueEuler(options: FetchOptions, balances: Balances, vaults: string[]) {
  const rates = await readVaultRates(options, vaults)
  if (!rates.length) return

  // Share-price growth is net of the 10% perf fee → gross-up, then split curator revenue from supplier yield.
  for (const v of rates) {
    const netYield = v.growthRatio > 0 ? v.totalAssets * v.growthRatio : 0
    const grossYield = netYield / (1 - SENTORA_EULER_PERF_RATE)
    const perf = grossYield - netYield
    balances.dailyFees.add(v.asset, grossYield, L.eulerYields)
    if (perf > 0) balances.dailyRevenue.add(v.asset, perf, L.eulerPerf)
    balances.dailySupplySideRevenue.add(v.asset, netYield, L.eulerSupply)
  }
}

async function accrueBoring(options: FetchOptions, balances: Balances, vaults?: string[]) {
  if (!vaults?.length) return

  // BoringVault addresses are reused across chains and may not exist on all of them.
  const hooks = await options.api.multiCall({ abi: ABIS.boringHook, calls: vaults, permitFailure: true })
  const hookValid: { vault: string; hook: string }[] = []
  for (let i = 0; i < vaults.length; i++) if (hooks[i]) hookValid.push({ vault: vaults[i], hook: hooks[i] })
  if (!hookValid.length) return

  const accountants = await options.api.multiCall({ abi: ABIS.boringAccountant, calls: hookValid.map(h => h.hook), permitFailure: true })
  const valid: { vault: string; accountant: string }[] = []
  for (let i = 0; i < hookValid.length; i++) if (accountants[i]) valid.push({ vault: hookValid[i].vault, accountant: accountants[i] })
  if (!valid.length) return

  const accountantTargets = valid.map(v => v.accountant)
  const vaultTargets = valid.map(v => v.vault)

  const [assets, decimals, supplies, statesV2, statesV1, ratesFrom, ratesTo] = await Promise.all([
    options.api.multiCall({ abi: ABIS.boringBase, calls: accountantTargets }),
    options.api.multiCall({ abi: 'uint8:decimals', calls: vaultTargets }),
    options.api.multiCall({ abi: 'uint256:totalSupply', calls: vaultTargets }),
    options.api.multiCall({ abi: ABIS.boringStateV2, calls: accountantTargets, permitFailure: true }),
    options.api.multiCall({ abi: ABIS.boringStateV1, calls: accountantTargets, permitFailure: true }),
    options.fromApi.multiCall({ abi: ABIS.boringRate, calls: accountantTargets }),
    options.toApi.multiCall({ abi: ABIS.boringRate, calls: accountantTargets }),
  ])

  for (let i = 0; i < valid.length; i++) {
    const perfFeeRate = boringPerfFeeRate(statesV1[i], statesV2[i])
    if (perfFeeRate === null) continue

    const asset = assets[i]
    const supply = toNum(supplies[i])
    const rateBase = 10 ** toNum(decimals[i])
    const rateBefore = toNum(ratesFrom[i])
    const rateAfter = toNum(ratesTo[i])
    if (rateAfter <= rateBefore) continue

    // Share-price growth is net of perf fee — gross-up, then keep only Sentora's 20% slice.
    const netYield = supply * (rateAfter - rateBefore) / rateBase
    const grossYield = perfFeeRate < 1 ? netYield / (1 - perfFeeRate) : netYield
    const sentoraPerf = (grossYield - netYield) * SENTORA_BORING_PERF_SHARE

    balances.dailyFees.add(asset, netYield + sentoraPerf, L.boringYields)
    balances.dailyRevenue.add(asset, sentoraPerf, L.boringPerf)
    balances.dailySupplySideRevenue.add(asset, netYield, L.boringSupply)
  }
}

// Sentora EtherFi supervised loans: leveraged weETH positions on Morpho (weETH collateral, borrowing
// stables), on which Sentora charges a 10% performance fee. We book the weETH restaking yield on the
// collateral (collateral x weETH exchange-rate growth) — priced off the rate, not the token price, so
// it carries no ETH-price noise, and it isn't counted anywhere else.
// ponytail: restaking leg only. The borrow/redeploy spread can't be isolated on-chain without the
// deploy destination and partly flows through the lending vaults already counted above, so this is a
// conservative floor on the supervised-loan fee.
async function accrueSupervisedLoans(options: FetchOptions, balances: Balances, loanManagers?: string[]) {
  if (!loanManagers?.length) return

  const [supplied, rateFrom, rateTo] = await Promise.all([
    options.fromApi.multiCall({ abi: 'uint256:getSupply', calls: loanManagers, permitFailure: true }),
    options.fromApi.call({ abi: 'uint256:getRate', target: WEETH }),
    options.toApi.call({ abi: 'uint256:getRate', target: WEETH }),
  ])

  // weETH rate is ETH per weETH (1e18); its growth over the window is the restaking yield per weETH.
  const growth = (toNum(rateTo) - toNum(rateFrom)) / 1e18
  if (growth <= 0) return

  for (let i = 0; i < loanManagers.length; i++) {
    const collateral = toNum(supplied[i]) // weETH collateral (18 decimals)
    if (!collateral) continue
    const grossYield = collateral * growth // ETH-denominated appreciation of the collateral
    const perf = grossYield * SENTORA_SUPERVISED_PERF_RATE
    balances.dailyFees.add(WETH, grossYield, L.supervisedYields)
    balances.dailyRevenue.add(WETH, perf, L.supervisedPerf)
    balances.dailySupplySideRevenue.add(WETH, grossYield - perf, L.supervisedSupply)
  }
}

function snapshotAt(snapshots: any[], timestamp: number): any | undefined {
  let best: any
  let bestTs = -Infinity
  for (const s of snapshots) {
    const ts = Date.parse(String(s.snapshot_datetime).split('.')[0] + 'Z') / 1000
    if (ts <= timestamp && ts > bestTs) { bestTs = ts; best = s }
  }
  return best
}

async function accrueUpshift(options: FetchOptions, balances: Balances, vaults: string[]) {
  if (!vaults.length) return

  const upshiftVaults: any[] = await getConfig('upshift-vaults', UPSHIFT_API)
  const byAddress = new Map<string, any>(upshiftVaults.map(v => [String(v.address).toLowerCase(), v]))

  const perfFeeOf = (info: any): number =>
    info && !waivedByDate(info.performance_fee_waived_until_date, options.toTimestamp)
      ? toNum(info.weekly_performance_fee_bps) / 100
      : 0

  // multiAssetVault contracts have no ERC4626 reads on-chain — NAV comes from Upshift API snapshots.
  const erc4626Vaults: string[] = []
  const multiAsset: any[] = []
  for (const vault of vaults) {
    const info = byAddress.get(vault.toLowerCase())
    if (info?.internal_type === 'multiAssetVault') multiAsset.push(info)
    else erc4626Vaults.push(vault)
  }

  const rates = await readVaultRates(options, erc4626Vaults)
  for (const v of rates) {
    const perfFee = perfFeeOf(byAddress.get(v.vault.toLowerCase()))
    const netYield = v.growthRatio > 0 ? v.totalAssets * v.growthRatio : 0
    const grossYield = perfFee > 0 && perfFee < 1 ? netYield / (1 - perfFee) : netYield
    const perf = grossYield - netYield
    balances.dailyFees.add(v.asset, grossYield, L.upshiftYields)
    if (perf > 0) balances.dailyRevenue.add(v.asset, perf, L.upshiftPerf)
    balances.dailySupplySideRevenue.add(v.asset, netYield, L.upshiftSupply)
  }

  for (const info of multiAsset) {
    const snapshots: any[] = info.historical_snapshots ?? []
    const before = snapshotAt(snapshots, options.fromTimestamp)
    const after = snapshotAt(snapshots, options.toTimestamp)
    if (!before || !after || after === before) continue

    const netYieldUsd = (toNum(after.asset_share_ratio) - toNum(before.asset_share_ratio)) * toNum(after.total_shares) * toNum(after.underlying_price)
    if (netYieldUsd <= 0) continue

    const perfFee = perfFeeOf(info)
    const grossYieldUsd = perfFee > 0 && perfFee < 1 ? netYieldUsd / (1 - perfFee) : netYieldUsd
    const perf = grossYieldUsd - netYieldUsd
    balances.dailyFees.addUSDValue(grossYieldUsd, L.upshiftYields)
    if (perf > 0) balances.dailyRevenue.addUSDValue(perf, L.upshiftPerf)
    balances.dailySupplySideRevenue.addUSDValue(netYieldUsd, L.upshiftSupply)
  }
}

async function accrueKamino(options: FetchOptions, balances: Balances, vaults: string[]) {
  if (!vaults.length) return

  const startDate = new Date((options.fromTimestamp - 86400) * 1000).toISOString().split('T')[0]
  const endDate = new Date((options.toTimestamp + 86400) * 1000).toISOString().split('T')[0]
  const elapsed = options.toTimestamp - options.fromTimestamp

  const perVault = await Promise.all(vaults.map(async vault => {
    const [config, history] = await Promise.all([
      fetchURL(`${KAMINO_API}/kvaults/vaults/${vault}`),
      fetchURL(`${KAMINO_API}/kvaults/vaults/${vault}/metrics/history?start=${startDate}&end=${endDate}`),
    ])
    return { config, history }
  }))

  for (const { config, history } of perVault) {
    const state = config?.state
    if (!state?.tokenMint) continue

    const tokenMint = state.tokenMint as string
    const decimals = toNum(state.tokenMintDecimals) || 6
    const perfFeeRate = toNum(state.performanceFeeBps) / FEE_BASE_4
    const mgmtFeeRate = toNum(state.managementFeeBps) / FEE_BASE_4

    // `interest` is cumulative since inception — window yield = last - first.
    const points: any[] = (Array.isArray(history) ? history : history?.history ?? [])
      .map((p: any) => ({ ...p, _ts: Date.parse(p.timestamp ?? p.date ?? '') / 1000 }))
      .filter((p: any) => isFinite(p._ts) && p._ts >= options.fromTimestamp && p._ts <= options.toTimestamp)
      .sort((a: any, b: any) => a._ts - b._ts)

    let grossInterest = 0
    if (points.length >= 2) {
      const delta = toNum(points[points.length - 1].interest) - toNum(points[0].interest)
      if (delta > 0) grossInterest = delta * 10 ** decimals
    }

    const perfFee = grossInterest * perfFeeRate
    const mgmtFee = toNum(state.prevAum) * mgmtFeeRate * elapsed / YEAR_SECS

    if (grossInterest > 0) {
      balances.dailyFees.add(tokenMint, grossInterest, L.kaminoYields)
      balances.dailyRevenue.add(tokenMint, perfFee, L.kaminoPerf)
      balances.dailySupplySideRevenue.add(tokenMint, grossInterest - perfFee, L.kaminoSupply)
    }
    if (mgmtFee > 0) {
      balances.dailyFees.add(tokenMint, mgmtFee, L.kaminoMgmt)
      balances.dailyRevenue.add(tokenMint, mgmtFee, L.kaminoMgmt)
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const balances: Balances = { dailyFees, dailyRevenue, dailySupplySideRevenue }

  const apiVaults: any[] = await getConfig('sentora-vaults', SENTORA_API)
  const chainVaults = apiVaults.filter(v => CHAIN_MAP[String(v?.blockchain?.chainId)] === options.chain)
  const byProtocol = (protocol: string, technology?: string) => chainVaults
    .filter(v => v.protocol === protocol && (!technology || v.technology === technology))
    .map(v => v.address)

  await accrueMorpho(options, balances, byProtocol('morpho', 'erc4626'))
  await accrueEuler(options, balances, byProtocol('eulerv2', 'erc4626'))
  await accrueUpshift(options, balances, byProtocol('sentora', 'upshift_financial'))
  await accrueBoring(options, balances, BORING_VAULTS[options.chain])
  await accrueSupervisedLoans(options, balances, SUPERVISED_LOAN_MANAGERS[options.chain])
  await accrueKamino(options, balances, byProtocol('kamino').filter(a => !KAMINO_VAULT_BLOCKLIST.has(a)))

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total yields generated by all assets deposited in Sentora-curated vaults (Morpho, Euler, Veda BoringVault, Upshift, Kamino) plus the weETH restaking yield of the EtherFi supervised-loan strategies.',
  Revenue: 'Performance and management fees retained by Sentora as the curator. For Veda BoringVaults, only Sentora\'s 20% share of the performance fee is counted (the remaining 80% accrues to Veda). For EtherFi supervised loans, Sentora\'s 10% performance fee on the weETH restaking yield (the borrow/redeploy spread is not included).',
  ProtocolRevenue: 'Performance and management fees retained by Sentora as the curator.',
  SupplySideRevenue: 'Yields distributed to depositors after curator fees.',
}

const feesBreakdown = {
  [L.morphoYields]: 'Total interest yields (supplier yield + curator fees) from Sentora-curated Morpho vaults.',
  [L.eulerYields]: 'Total interest yields (supplier yield + curator fees) from Sentora-curated Euler v2 vaults.',
  [L.boringYields]: 'Sentora-attributed flow (supplier yield + Sentora perf share) from Veda BoringVaults.',
  [L.upshiftYields]: 'Interest yields from Sentora-curated Upshift vaults.',
  [L.kaminoYields]: 'Interest yields from Sentora-curated Kamino kvaults (Solana).',
  [L.kaminoMgmt]: 'Per-second management fees on Kamino kvault TVL.',
  [L.supervisedYields]: 'weETH restaking yield on the collateral of the EtherFi supervised-loan strategies (leveraged weETH positions on Morpho).',
}

const revenueBreakdown = {
  [L.morphoPerf]: 'Performance fee shares minted to the Morpho performance fee recipient (AccrueInterest events).',
  [L.morphoMgmt]: 'Management fee shares minted to the Morpho V2 management fee recipient (AccrueInterest events).',
  [L.eulerPerf]: 'Sentora 10% performance fee on Euler v2 vault yields.',
  [L.boringPerf]: 'Sentora 20% share of the Veda BoringVault performance fee.',
  [L.upshiftPerf]: 'Sentora performance fee on Upshift vault yields (rate and waiver state driven by the Upshift API).',
  [L.kaminoPerf]: 'Performance fees on interest earned by Kamino kvaults.',
  [L.kaminoMgmt]: 'Management fees on Kamino kvault TVL.',
  [L.supervisedPerf]: 'Sentora 10% performance fee on the weETH restaking yield of the EtherFi supervised-loan strategies.',
}

const breakdownMethodology = {
  Fees: feesBreakdown,
  Revenue: revenueBreakdown,
  ProtocolRevenue: revenueBreakdown,
  SupplySideRevenue: {
    [L.morphoSupply]: 'Net yield distributed to Morpho vault depositors.',
    [L.eulerSupply]: 'Net yield distributed to Euler v2 vault depositors.',
    [L.boringSupply]: 'Net yield distributed to Veda BoringVault depositors.',
    [L.upshiftSupply]: 'Net yield distributed to Upshift vault depositors.',
    [L.kaminoSupply]: 'Net yield distributed to Kamino kvault depositors.',
    [L.supervisedSupply]: 'weETH restaking yield distributed to EtherFi supervised-loan depositors after Sentora\'s fee.',
  },
}

const adapter: Adapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-09-25' },
    [CHAIN.INK]: { fetch, start: '2025-09-15' },
    [CHAIN.SOLANA]: { fetch, start: '2025-11-01' },
  },
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
}

export default adapter
