import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

type ChainConfig = {
  start: string
  contractAddress: string
  directAddress: string
  duneChain?: string
  lzContract?: string
}

// Gas.zip listed new direct v1 forwarder is wrong via onchain analysis
// Use active direct forwarder 0x391E...; docs-listed 0xaAaA... has no observed inbound activity on supported chains.
const DIRECT_FORWARDER = "0x391E7C679d29bD940d63be94AD22A25d25b5A604"
const CONTRACT_FORWARDER = "0x2a37D63EAdFe4b4682a3c28C1c2cD4F109Cc2762"
const GAS_LZ_V2 = "0x26DA582889f59EaaE9dA1f063bE0140CD93E6a4f"
const LOW_128_BITS = (1n << 128n) - 1n
const eventAbi = {
  deposit: "event Deposit(address from, uint256 chains, uint256 amount, address to)",
  sentDeposits: "event SentDeposits(uint256[] params, address to, uint value, uint fee, address from)",
}

// Inbound addresses are sourced from https://dev.gas.zip/gas/chain-support/inbound.
// Start dates are contract deployment dates.
// Commented out all inactive chains where there are no tx from last 30 days
// All chains are dune supported hence no other dunebased varaiable is needed 
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ARBITRUM]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  [CHAIN.OPTIMISM]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  [CHAIN.AVAX]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, duneChain: "avalanche_c", lzContract: GAS_LZ_V2 },
  [CHAIN.BASE]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  [CHAIN.POLYGON]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  [CHAIN.SCROLL]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  // [CHAIN.ZORA]: { start: "2024-02-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  [CHAIN.ETHEREUM]: { start: "2024-02-05", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, lzContract: GAS_LZ_V2 },
  // [CHAIN.BLAST]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.XDAI]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.MODE]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.METIS]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.MANTLE]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.XLAYER]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.TAIKO]: { start: "2024-10-14", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.WC]: { start: "2024-11-27", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, duneChain: "worldchain" },
  [CHAIN.APECHAIN]: { start: "2024-11-27", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.LISK]: { start: "2024-11-27", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.SONIC]: { start: "2024-12-31", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.INK]: { start: "2025-01-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.BITLAYER]: { start: "2025-01-02", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.CRONOS]: { start: "2025-01-08", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.FRAXTAL]: { start: "2025-01-08", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.BERACHAIN]: { start: "2025-02-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.SONEIUM]: { start: "2025-02-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.UNICHAIN]: { start: "2025-02-13", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.HYPERLIQUID]: { start: "2025-02-18", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, duneChain: "hyperevm" },
  [CHAIN.BOB]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.CORN]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.ETHERLINK]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.HEMI]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.SSEED]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, duneChain: "superseed" },
  // [CHAIN.SUPERPOSITION]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.SWELLCHAIN]: { start: "2025-04-09", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.XDC]: { start: "2025-05-20", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.AURORA]: { start: "2025-07-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.FUSE]: { start: "2025-07-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.IMX]: { start: "2025-07-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.KLAYTN]: { start: "2025-07-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER, duneChain: "kaia" },
  // [CHAIN.MOONBEAM]: { start: "2025-07-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  // [CHAIN.MOONRIVER]: { start: "2025-07-11", directAddress: DIRECT_FORWARDER, contractAddress: CONTRACT_FORWARDER },
  [CHAIN.LINEA]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: "0xA60768b03eB14d940F6c9a8553329B7F9037C91b" },
  [CHAIN.ERA]: { start: "2024-09-25", directAddress: DIRECT_FORWARDER, contractAddress: "0x252fb662e4d7435d2a5ded8ec94d8932cf76c178", duneChain: "zksync" },
  // [CHAIN.GRAVITY]: { start: "2024-10-14", directAddress: DIRECT_FORWARDER, contractAddress: "0x6Efc6Ead40786bD87A884382b6EA4BcA3C985e99" },
  [CHAIN.CELO]: { start: "2025-01-08", directAddress: DIRECT_FORWARDER, contractAddress: "0xA60768b03eB14d940F6c9a8553329B7F9037C91b" },
  [CHAIN.ABSTRACT]: { start: "2025-01-14", directAddress: DIRECT_FORWARDER, contractAddress: "0x252fb662e4D7435D2a5DED8EC94d8932CF76C178" },
  // [CHAIN.LENS]: { start: "2025-04-15", directAddress: DIRECT_FORWARDER, contractAddress: "0xDeb8609F3f6c1A3EA814ED571C7d7C61a9Cfa76A" },
  // [CHAIN.NIBIRU]: { start: "2025-05-23", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  [CHAIN.RONIN]: { start: "2025-05-27", directAddress: DIRECT_FORWARDER, contractAddress: "0x31030df252cb281d8b94863af6af4af8774adb7e" },
  // [CHAIN.TOMOCHAIN]: { start: "2025-05-27", directAddress: DIRECT_FORWARDER, contractAddress: "0x549Fd6feFAe192deFd626279d479F8F754B85fB7" },
  [CHAIN.PLUME]: { start: "2025-05-27", directAddress: DIRECT_FORWARDER, contractAddress: "0xc62155f48D2aEE12FFF6Bb3b7946385d3A98854C", duneChain: "plume" },
  [CHAIN.KATANA]: { start: "2025-06-12", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  // [CHAIN.VANA]: { start: "2025-06-21", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  [CHAIN.SOPHON]: { start: "2025-07-25", directAddress: DIRECT_FORWARDER, contractAddress: "0x6CbC57A6162839d782B2B4a1BD18554135e4Fafa" },
  // [CHAIN.SOMNIA]: { start: "2025-09-02", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  [CHAIN.MONAD]: { start: "2025-09-03", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  [CHAIN.PLASMA]: { start: "2025-09-09", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  // [CHAIN.FLOW]: { start: "2025-09-19", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  // [CHAIN.BOTANIX]: { start: "2025-11-01", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  [CHAIN.MEGAETH]: { start: "2025-11-25", directAddress: DIRECT_FORWARDER, contractAddress: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" },
  // [CHAIN.ARBITRUM_NOVA]: { start: "2026-03-18", directAddress: DIRECT_FORWARDER, contractAddress: "0x5D5a72859b8EBAFcf459164F64400012F5A3C5E0" },
  // [CHAIN.PHAROS]: { start: "2026-03-30", directAddress: DIRECT_FORWARDER, contractAddress: "0x9e22ebec84c7e4c4bd6d4ae7ff6f4d436d6d8390" },
}

const getDuneChain = (chain: string, config: ChainConfig) => config.duneChain ?? chain
const duneChains = Object.entries(chainConfig).map(([chain, config]) => `'${getDuneChain(chain, config)}'`).join(", ")

const prefetch = async (options: FetchOptions) => {
  const target = DIRECT_FORWARDER.slice(2).toLowerCase()

  const rows = await queryDuneSql(options, `
    SELECT blockchain, COALESCE(SUM(value), 0) AS amount
    FROM evms.transactions
    WHERE blockchain IN (${duneChains})
      AND "to" = from_hex('${target}')
      AND value > 0
      AND TIME_RANGE
    GROUP BY 1
  `)

  return Object.fromEntries(rows.map((row: any) => [row.blockchain, row.amount]))
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain]
  const dailyBridgeVolume = options.createBalances()

  dailyBridgeVolume.addGasToken(options.preFetchedResults?.[getDuneChain(options.chain, config)] ?? 0)

  const logs = await options.getLogs({ target: config.contractAddress, eventAbi: eventAbi.deposit })
  logs.forEach((log) => dailyBridgeVolume.addGasToken(log.amount))

  if (config.lzContract) {
    const lzLogs = await options.getLogs({ target: config.lzContract, eventAbi: eventAbi.sentDeposits })
    lzLogs.forEach((log) => {
      log.params.forEach((param: bigint | string) => {
        // GasLZV2 casts each packed deposit param to uint128 before nativeDrop.
        dailyBridgeVolume.addGasToken(BigInt(param.toString()) & LOW_128_BITS)
      })
    })
  }

  return { dailyBridgeVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  prefetch,
  fetch,
  adapter: chainConfig,
  isExpensiveAdapter: true,
}

export default adapter
