import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const PAIR_CREATED = 'event PairCreated(address indexed tokenA, address indexed tokenB, address pair, uint256 index)'
const PRE_LAUNCHED = 'event PreLaunched(address indexed token, address indexed pair, uint256 a, uint256 b, tuple(uint8,uint16,bool,uint8,bool) params)'
const LAUNCHED = 'event Launched(address indexed token, address indexed pair, uint256 a, uint256 b, uint256 c, tuple(uint8,uint16,bool,uint8,bool) params)'
const SWAP = 'event Swap(uint256 amount0In, uint256 amount0Out, uint256 amount1In, uint256 amount1Out)'

type PairSource = { factory: string, fromBlock: number, events: string[], quoteToken?: string }
type ChainConfig = { start: string, pairSources: PairSource[] }

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    start: '2024-10-15',
    pairSources: [
      { factory: '0x158d7ccaa23dc3c8861c3323ed546e3d25e74309', fromBlock: 21843902, events: [PAIR_CREATED] }, // legacy FFactory, 2024-11 to 2026-03
      { factory: '0xd7d3c85b4f2e9bee1998cd2e98820e647792d284', fromBlock: 36532291, events: [PAIR_CREATED] }, // legacy FFactory, 2025-10 to 2026-03
      { factory: '0x1a540088125d00dd3990f9da45ca0859af4d3b01', fromBlock: 43899749, events: [PRE_LAUNCHED, LAUNCHED] }, // bonding, since 2026-03-27
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-07-02',
    pairSources: [
      { factory: '0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007', fromBlock: 220679, events: [PRE_LAUNCHED, LAUNCHED] },
    ],
  },
  [CHAIN.ARC]: {
    start: '2026-09-15',
    pairSources: [
      { factory: '0x7841c01489be445dc038201f8d5d21b6052a955e', fromBlock: 21176874, events: [PAIR_CREATED], quoteToken: '0x8c4252c87081c88c6ad57d6dd97e1cafebf842b7' },
    ],
  },
}

const fetchEvm = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const { pairSources } = chainConfig[options.chain]

  const pairs = new Set<string>()
  for (const { factory, fromBlock: factoryFromBlock, events, quoteToken } of pairSources) {
    for (const eventAbi of events) {
      const logs = await options.getLogs({ target: factory, eventAbi, fromBlock: factoryFromBlock, cacheInCloud: true })
      for (const log of logs) {
        if (quoteToken && log.tokenB.toLowerCase() !== quoteToken) continue
        pairs.add(log.pair.toLowerCase())
      }
    }
  }

  // tens of thousands of pairs: read every Swap with this signature and keep the bonding pairs'
  const swaps = await options.getLogs({ eventAbi: SWAP, noTarget: true, entireLog: true, parseLog: true })
  let virtualVolume = 0n
  for (const log of swaps) {
    if (!pairs.has((log.address ?? log.source).toLowerCase())) continue
    const { amount1In, amount1Out } = log.parsedLog.args
    virtualVolume += BigInt(amount1In) + BigInt(amount1Out)
  }
  dailyVolume.addCGToken('virtual-protocol', Number(virtualVolume) / 1e18)
  return { dailyVolume }
}

const fetchSolana = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const sql = getSqlFromFile('helpers/queries/virtual-protocol-volume.sql', { startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp })
  const [row] = await queryDuneSql(options, sql)
  if (!row) throw new Error('virtual-protocol: no Solana volume returned')
  dailyVolume.addCGToken('virtual-protocol', row.virtual_volume)
  return { dailyVolume }
}

const methodology = {
  Volume: "Bonding-curve trading volume on Virtual Protocol's own venue: the VIRTUAL leg of each trade, priced to USD. Post-graduation trades are excluded as they occur on third-party DEXs already counted elsewhere. On Base, Robinhood and Arc the bonding pairs come from the Virtual Protocol factory and bonding contracts' pair-creation events (VIRTUAL-quoted pairs only on Arc), and volume is read from each pair's Swap events. On Solana both bonding venues are counted: Virtual Protocol's own program from 2025-02, whose pools are found from the tax paid in each swap because that program is not decoded, and its Meteora Dynamic Bonding Curve from 2026-08-21, whose pools come from the VIRTUAL-quoted DBC configs, net of the launch fee.",
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: { fetch: fetchEvm, start: chainConfig[CHAIN.BASE].start },
    [CHAIN.ROBINHOOD]: { fetch: fetchEvm, start: chainConfig[CHAIN.ROBINHOOD].start },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2025-02-11' },
    [CHAIN.ARC]: { fetch: fetchEvm, start: chainConfig[CHAIN.ARC].start },
  },
  dependencies: [Dependencies.DUNE],
  methodology,
  isExpensiveAdapter: true,
}

export default adapter;
