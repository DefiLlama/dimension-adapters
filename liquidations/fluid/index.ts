import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { nullAddress } from '../../helpers/token'
import { getVaultsResolver } from '../../fees/fluid/fees'
import { CONFIG_FLUID } from '../../fees/fluid/config'

// Every Fluid vault type emits the same LogLiquidate. For normal collateral vaults (T1, T3) colAmt_ is
// the supply token amount paid to the liquidator. For smart collateral vaults (T2, T4) colAmt_ is DEX
// collateral shares, which the vault redeems in the same transaction through the DEX, either in both
// tokens (LogWithdrawPerfectColLiquidity) or in one (LogWithdrawColInOneToken). Both carry the shares
// and the token amounts paid out, in token decimals.
const abis = {
  LogLiquidate: 'event LogLiquidate(address liquidator_, uint256 colAmt_, uint256 debtAmt_, address to_)',
  LogWithdrawPerfectColLiquidity: 'event LogWithdrawPerfectColLiquidity(uint256 shares, uint256 token0Amt, uint256 token1Amt)',
  LogWithdrawColInOneToken: 'event LogWithdrawColInOneToken(uint256 shares, uint256 token0Amt, uint256 token1Amt)',
}

const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const token = (t: string) => t.toLowerCase() === NATIVE ? nullAddress : t

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const resolver = await getVaultsResolver(options.api)
  const vaults: string[] = await resolver.getAllVaultsAddresses()
  if (!vaults.length) return { dailyCollateralLiquidated }

  const logs: any[] = await options.getLogs({ targets: vaults, eventAbi: abis.LogLiquidate, entireLog: true, parseLog: true })
  if (!logs.length) return { dailyCollateralLiquidated }

  const liquidatedVaults = [...new Set(logs.map((l) => l.address.toLowerCase()))]
  const vaultDatas: any[] = await resolver.getVaultEntireData(liquidatedVaults)
  const vaultInfo: Record<string, { smartCol: boolean; dex?: string; token0: string; token1?: string }> = {}
  liquidatedVaults.forEach((vault, i) => {
    const data = vaultDatas[i]
    if (!data) return
    const supplyToken = data.constantVariables.supplyToken
    // pre-smart-vault resolvers return supplyToken as a plain address
    if (typeof supplyToken === 'string') vaultInfo[vault] = { smartCol: false, token0: supplyToken }
    else vaultInfo[vault] = { smartCol: data.isSmartCol, dex: data.constantVariables.supply, token0: supplyToken.token0, token1: supplyToken.token1 }
  })

  const dexes = [...new Set(Object.values(vaultInfo).filter((v) => v.smartCol).map((v) => v.dex!))]
  const dexWithdrawals: Record<string, any[]> = {}
  if (dexes.length) {
    const dexLogs: any[] = (await Promise.all([
      options.getLogs({ targets: dexes, eventAbi: abis.LogWithdrawPerfectColLiquidity, entireLog: true, parseLog: true }),
      options.getLogs({ targets: dexes, eventAbi: abis.LogWithdrawColInOneToken, entireLog: true, parseLog: true }),
    ])).flat()
    for (const log of dexLogs) {
      const key = `${log.transactionHash}-${log.address}`.toLowerCase()
      if (!dexWithdrawals[key]) dexWithdrawals[key] = []
      dexWithdrawals[key].push(log.args)
    }
  }

  for (const log of logs) {
    const info = vaultInfo[log.address.toLowerCase()]
    if (!info) throw new Error(`fluid: no vault data for ${log.address}`)
    const colAmt = BigInt(log.args.colAmt_)
    if (colAmt === 0n) continue // absorb only, nothing paid out

    if (!info.smartCol) {
      dailyCollateralLiquidated.add(token(info.token0), colAmt)
      continue
    }

    const candidates = dexWithdrawals[`${log.transactionHash}-${info.dex}`.toLowerCase()] ?? []
    const idx = candidates.findIndex((w: any) => BigInt(w.shares) === colAmt)
    if (idx === -1) throw new Error(`fluid: no DEX collateral withdrawal for smart vault liquidation ${log.transactionHash}`)
    const [withdrawal] = candidates.splice(idx, 1)
    dailyCollateralLiquidated.add(token(info.token0), withdrawal.token0Amt)
    dailyCollateralLiquidated.add(token(info.token1!), withdrawal.token1Amt)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.entries(CONFIG_FLUID).map(([chain, { start }]) => [chain, { start }])),
  methodology: {
    CollateralLiquidated: 'Collateral paid out in Fluid vault LogLiquidate events. Smart collateral vaults liquidate DEX shares, so their payout is read from the matching LogWithdrawPerfectColLiquidity event the DEX emits in the same transaction.',
  },
}

export default adapter
