import { Balances } from "@defillama/sdk";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// Virtuals keeps 30% of the 1% agent-token trading tax and pays 70% to the agent creator:
// https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/virtuals-launch-mechanics
const TREASURY_SHARE_PERCENT = 30n
const treasuryShare = (amount: bigint) => amount * TREASURY_SHARE_PERCENT / 100n

const EVM_TREASURY = '0xb51c52d9e5e41937b0100840b6c3cba6f7a57a0c'

const BASE = {
  VIRTUAL: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
  CBBTC: ADDRESSES.base.cbBTC,
  USDC: ADDRESSES.base.USDC,
  FEE_WALLET: '0x86cbac9d9ac726f729eef6627dc4817bcbb03a9c',
  PROTOTYPE_WALLET: '0x89c69df65d0f6a0df92b2f5b0715e9663b711341',
  COW_SETTLEMENT: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  TAX_MANAGER: '0x7e26173192d72fd6d75a759f888d61c2cdbb64b1',
  INVERTED_PAYOUT_BLOCKS: [48011352, 48570673],
}

const ETHEREUM = {
  VIRTUAL: '0x44ff8620b8ca30902395a7bd3f2407e1a091bf73',
  TAX_WALLET: '0xb754597fdf090b6c860cb1deb63585aa3f19c163',
}

const ROBINHOOD = {
  USDG: ADDRESSES.robinhood.USDG,
  TAX_MANAGER: '0x6d80b81d9fc56a7a839b1af9006eb49151961ce7',
}

const ARC = {
  VIRTUAL: '0x8c4252c87081c88c6ad57d6dd97e1cafebf842b7',
  TAX_VAULT: '0x79f156c614ee6b68cd161366903f27af0f61ef8f',
  FEE_WALLET: '0x86cbac9d9ac726f729eef6627dc4817bcbb03a9c',
}

const SOLANA = {
  VIRTUAL: '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y',
  JUPUSD: 'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD',
  BONDING_COLLECTOR: '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL',
  TAX_DISTRIBUTOR: 'Bo2jk8vNANP3cEgsEWCszvzy9mPR8CPqQKenUkNbyBHm',
  TREASURY: '9yEiY8zzVcV5ASmFub9X3Ti96AAwboYRVAKajwbpba5',
}

const LEGACY = {
  fees: 'Bonding Curve Tax And Launch Fees',
  treasury: 'Bonding Curve Tax And Launch Fees To Virtuals Treasury',
}
const AGENT_TAX = {
  fees: 'Agent Token Trading Tax',
  treasury: 'Agent Token Trading Tax To Virtuals Treasury',
  creators: 'Agent Token Trading Tax To Agent Creators',
}

type Add = (balances: Balances, amount: bigint, label: string) => void
const addToken = (token: string): Add => (balances, amount, label) => balances.add(token, amount, label)
const addArcVirtual: Add = (balances, amount, label) => balances.addCGToken('virtual-protocol', Number(amount) / 1e18, label)

const createResult = (options: FetchOptions) => ({
  dailyFees: options.createBalances(),
  dailyRevenue: options.createBalances(),
  dailySupplySideRevenue: options.createBalances(),
})
type Result = ReturnType<typeof createResult>

const addKept = (result: Result, add: Add, amount: bigint) => {
  add(result.dailyFees, amount, LEGACY.fees)
  add(result.dailyRevenue, amount, LEGACY.treasury)
}

const addAgentTax = (result: Result, add: Add, amount: bigint, toTreasury: bigint) => {
  add(result.dailyFees, amount, AGENT_TAX.fees)
  add(result.dailyRevenue, toTreasury, AGENT_TAX.treasury)
  add(result.dailySupplySideRevenue, amount - toTreasury, AGENT_TAX.creators)
}

const withProtocolRevenue = (result: Result) => ({
  ...result,
  dailyProtocolRevenue: result.dailyRevenue.clone(),
})

type Transfer = { token: string, from: string, to: string, value: bigint, blockNumber: number }

const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const toTopic = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0')

const getTransfers = async (options: FetchOptions, tokens: string[], { from, to }: { from?: string, to?: string }): Promise<Transfer[]> => {
  const logs = await options.getLogs({
    targets: tokens,
    flatten: false,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, from ? toTopic(from) : null, to ? toTopic(to) : null] as string[],
    onlyArgs: false,
  })
  return logs.flatMap((tokenLogs: any[], i: number) => tokenLogs.map((log: any) => ({
    token: tokens[i],
    from: log.args.from.toLowerCase(),
    to: log.args.to.toLowerCase(),
    value: BigInt(log.args.value),
    blockNumber: Number(log.blockNumber),
  })))
}

const sum = (transfers: Transfer[], amount = (t: Transfer) => t.value) => transfers.reduce((acc, t) => acc + amount(t), 0n)

// A tax manager's payouts: the transfers to the treasury are Virtuals' share, the rest went to the agent side
const toTreasury = (t: Transfer) => t.to === EVM_TREASURY ? t.value : 0n

const fetchBase = async (options: FetchOptions) => {
  const result = createResult(options)

  addKept(result, addToken(BASE.VIRTUAL), sum(await getTransfers(options, [BASE.VIRTUAL], { to: BASE.FEE_WALLET })))
  const prototypeTax = (await getTransfers(options, [BASE.CBBTC], { to: BASE.PROTOTYPE_WALLET })).filter(t => t.from !== BASE.COW_SETTLEMENT)
  addKept(result, addToken(BASE.CBBTC), sum(prototypeTax))

  const payouts = await getTransfers(options, [BASE.CBBTC, BASE.USDC], { from: BASE.TAX_MANAGER })
  const cbBtcPayouts = payouts.filter(t => t.token === BASE.CBBTC)
  const usdcPayouts = payouts.filter(t => t.token === BASE.USDC)
  const [firstInverted, lastInverted] = BASE.INVERTED_PAYOUT_BLOCKS
  const usdcToTreasury = (t: Transfer) => t.blockNumber >= firstInverted && t.blockNumber <= lastInverted ? treasuryShare(t.value) : toTreasury(t)
  addAgentTax(result, addToken(BASE.CBBTC), sum(cbBtcPayouts), sum(cbBtcPayouts, toTreasury))
  addAgentTax(result, addToken(BASE.USDC), sum(usdcPayouts), sum(usdcPayouts, usdcToTreasury))

  return withProtocolRevenue(result)
}

const fetchEthereum = async (options: FetchOptions) => {
  const result = createResult(options)
  const taxed = sum(await getTransfers(options, [ETHEREUM.VIRTUAL], { to: ETHEREUM.TAX_WALLET }))
  addAgentTax(result, addToken(ETHEREUM.VIRTUAL), taxed, treasuryShare(taxed))
  return withProtocolRevenue(result)
}

const fetchRobinhood = async (options: FetchOptions) => {
  const result = createResult(options)
  const padded = await getTransfers(options, [ROBINHOOD.USDG], { from: ROBINHOOD.TAX_MANAGER })

  const blockTimes = new Map<number, number>()
  for (const blockNumber of new Set(padded.map(t => t.blockNumber))) {
    const block = await options.api.provider.getBlock(blockNumber)
    if (!block) throw new Error(`virtual-protocol: robinhood block ${blockNumber} not found`)
    blockTimes.set(blockNumber, block.timestamp)
  }
  const payouts = padded.filter(t => {
    const time = blockTimes.get(t.blockNumber)!
    return time >= options.startTimestamp && time < options.endTimestamp
  })

  addAgentTax(result, addToken(ROBINHOOD.USDG), sum(payouts), sum(payouts, toTreasury))
  return withProtocolRevenue(result)
}

const fetchArc = async (options: FetchOptions) => {
  const result = createResult(options)
  const taxed = sum(await getTransfers(options, [ARC.VIRTUAL], { to: ARC.TAX_VAULT }))
  addAgentTax(result, addArcVirtual, taxed, treasuryShare(taxed))
  addKept(result, addArcVirtual, sum(await getTransfers(options, [ARC.VIRTUAL], { to: ARC.FEE_WALLET })))
  return withProtocolRevenue(result)
}

const fetchSolana = async (options: FetchOptions) => {
  const result = createResult(options)
  const rows = await queryAllium(`
    SELECT
      mint,
      TO_VARCHAR(SUM(raw_amount)) AS total,
      TO_VARCHAR(SUM(IFF(to_address = '${SOLANA.TREASURY}', raw_amount, 0))) AS to_treasury
    FROM solana.assets.transfers
    WHERE ((mint = '${SOLANA.VIRTUAL}' AND to_address = '${SOLANA.BONDING_COLLECTOR}')
      OR (mint = '${SOLANA.JUPUSD}' AND from_address = '${SOLANA.TAX_DISTRIBUTOR}'))
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint
  `)
  for (const row of rows) {
    if (row.mint === SOLANA.VIRTUAL) addKept(result, addToken(SOLANA.VIRTUAL), BigInt(row.total))
    else addAgentTax(result, addToken(SOLANA.JUPUSD), BigInt(row.total), BigInt(row.to_treasury))
  }
  return withProtocolRevenue(result)
}

const methodology = {
  Fees: 'Fees paid to Virtuals Protocol: the 1% trading tax on agent tokens, plus the bonding-curve tax and agent launch fees of the original launch model. The agent-token tax is measured where it is paid out (Base and Robinhood tax managers, the Solana distributor) or where it accrues before being split (Arc tax vault, Ethereum tax wallet).',
  Revenue: 'The part kept by the Virtuals treasury: all bonding-curve tax and launch fees of the original launch model, and its share of the agent-token trading tax (about 20% from December 2024 to March 2025, 30% since April 2025).',
  ProtocolRevenue: 'The part kept by the Virtuals treasury: all bonding-curve tax and launch fees of the original launch model, and its share of the agent-token trading tax (about 20% from December 2024 to March 2025, 30% since April 2025).',
  SupplySideRevenue: 'The part of the agent-token trading tax paid to agents: to each agent\'s creator (70% since April 2025), and from December 2024 to March 2025 mostly to the agent\'s own treasury.',
}

const breakdownMethodology = {
  Fees: {
    [LEGACY.fees]: 'Original launch model fees that Virtuals kept in full: the trading tax on bonding-curve trades before graduation and the flat VIRTUAL fee to launch an agent (Base VIRTUAL and cbBTC fee wallets, the Solana bonding program before 2026-08-21, and the Arc launch fee wallet).',
    [AGENT_TAX.fees]: '1% buy and sell tax on agent tokens, paid out in cbBTC, USDC, USDG or JupUSD by the tax managers, or accrued in VIRTUAL on Arc and Ethereum.',
  },
  Revenue: {
    [LEGACY.treasury]: 'All bonding-curve tax and launch fees of the original launch model.',
    [AGENT_TAX.treasury]: 'Agent-token trading tax paid to the Virtuals treasury: about 20% from December 2024 to March 2025, 30% since April 2025.',
  },
  SupplySideRevenue: {
    [AGENT_TAX.creators]: 'Agent-token trading tax paid to each agent\'s creator (70% since April 2025), and from December 2024 to March 2025 mostly to the agent\'s own treasury.',
  },
  ProtocolRevenue: {
    [LEGACY.treasury]: 'All bonding-curve tax and launch fees of the original launch model.',
    [AGENT_TAX.treasury]: 'Agent-token trading tax paid to the Virtuals treasury.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  adapter: {
    [CHAIN.BASE]: { fetch: fetchBase, start: '2024-10-15' },
    [CHAIN.ETHEREUM]: { fetch: fetchEthereum, start: '2025-06-11' },
    [CHAIN.ROBINHOOD]: { fetch: fetchRobinhood, start: '2026-07-02' },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2025-02-11' },
    [CHAIN.ARC]: { fetch: fetchArc, start: '2026-09-15' },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
}

export default adapter;
