import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Goo Exchange curated vaults (https://goo.exchange/vaults): every arbitrage profit made through a vault's pool is paid
// to that vault's profit splitter, which sends 12.5% to the fee jar (it auctions what it holds for GOO and burns the
// GOO), 12.5% to the development fund and 75% back to the vault, which compounds it for the depositors.
// The factory lists every vault; each vault exposes its splitter.
const VAULT_FACTORY = '0xB4FE65D4A7Fa5Fe40A58e78eF3B5eE34a0059643'
const VAULT_FACTORY_BLOCK = 92908219 // 2026-10-19 20:46 UTC; no vault or profit exists before it
const DISTRIBUTED = 'event Distributed(address indexed token, uint256 toJar, uint256 toDevFund, uint256 toCompounder)'

const ARBITRAGE_PROFITS = 'Arbitrage Profits'
const TO_DEPOSITORS = 'Arbitrage Profits To Depositors'
const TO_BURN = 'Arbitrage Profits To GOO Buyback And Burn'
const TO_DEV_FUND = 'Arbitrage Profits To Development Fund'

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getLogs } = options
  const dailyFees = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const result = { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue }
  if (await options.getToBlock() < VAULT_FACTORY_BLOCK) return result

  const vaults = await api.fetchList({ lengthAbi: 'function vaultCount() view returns (uint256)', itemAbi: 'function vaultAt(uint256) view returns (address)', target: VAULT_FACTORY })
  const [splitters, token0s, token1s] = await Promise.all([
    api.multiCall({ abi: 'address:splitter', calls: vaults }),
    api.multiCall({ abi: 'address:token0', calls: vaults }),
    api.multiCall({ abi: 'address:token1', calls: vaults }),
  ])
  if (splitters.length) {
    const logs = await getLogs({ targets: splitters, eventAbi: DISTRIBUTED, flatten: false })
    logs.forEach((splitterLogs: any[], i: number) => {
      // only the vault's own two tokens: anything else sent to a splitter never reaches the vault
      const vaultTokens = new Set([token0s[i].toLowerCase(), token1s[i].toLowerCase()])
      for (const { token, toJar, toDevFund, toCompounder } of splitterLogs) {
        if (!vaultTokens.has(token.toLowerCase())) continue
        dailyFees.add(token, BigInt(toJar) + BigInt(toDevFund) + BigInt(toCompounder), ARBITRAGE_PROFITS)
        dailySupplySideRevenue.add(token, toCompounder, TO_DEPOSITORS)
        dailyRevenue.add(token, toJar, TO_BURN)
        dailyRevenue.add(token, toDevFund, TO_DEV_FUND)
        dailyHoldersRevenue.add(token, toJar, TO_BURN)
        dailyProtocolRevenue.add(token, toDevFund, TO_DEV_FUND)
      }
    })
  }

  return result
}

const methodology = {
  Fees: "Arbitrage profit made through the vaults' pools, as each vault's profit splitter pays it out.",
  SupplySideRevenue: "75% of the profit, compounded into the vault for its depositors.",
  Revenue: "25% of the profit: half to the fee jar, which buys GOO and burns it, and half to the development fund.",
  HoldersRevenue: "12.5% of the profit, sent to the fee jar, which auctions it for GOO and burns the GOO.",
  ProtocolRevenue: "12.5% of the profit, paid to the development fund.",
}

const breakdownMethodology = {
  Fees: { [ARBITRAGE_PROFITS]: methodology.Fees },
  SupplySideRevenue: { [TO_DEPOSITORS]: methodology.SupplySideRevenue },
  Revenue: { [TO_BURN]: methodology.HoldersRevenue, [TO_DEV_FUND]: methodology.ProtocolRevenue },
  HoldersRevenue: { [TO_BURN]: methodology.HoldersRevenue },
  ProtocolRevenue: { [TO_DEV_FUND]: methodology.ProtocolRevenue },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-19',
  methodology,
  breakdownMethodology,
}

export default adapter
