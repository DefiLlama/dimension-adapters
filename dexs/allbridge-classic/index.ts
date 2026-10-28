import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { queryAllium } from '../../helpers/allium';
import { CHAIN } from '../../helpers/chains';
import ADDRESSES from '../../helpers/coreAssets.json';

const EVM_BRIDGE = '0xBBbD1BbB4f9b936C3604906D7592A644071dE884'
// emitted by lock()/lockBase(); amount is what gets bridged after the fee, in the local token's decimals
const SENT_EVENT = 'event Sent(bytes4 tokenSource, bytes32 tokenSourceAddress, address sender, bytes32 indexed recipient, uint256 amount, uint128 indexed lockId, bytes4 destination)'
const TOKEN_SOURCE_MAP_ABI = 'function tokenSourceMap(bytes4, bytes32) view returns (address)'
const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO_ADDRESS = ADDRESSES.null

// current Stacks bridge (deployed 2024-02-19) and the legacy one it replaced
const STACKS_BRIDGES = ['SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.bridge', 'SP31MH65V85NDTM30FJBKP4JNC39HR1ZX3CRW9Z97.bridge']

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: '2021-11-13' },
  [CHAIN.BSC]: { start: '2021-11-13' },
  [CHAIN.POLYGON]: { start: '2021-11-10' },
  [CHAIN.AVAX]: { start: '2021-11-13' },
  [CHAIN.FANTOM]: { start: '2021-11-21' },
  [CHAIN.CELO]: { start: '2021-11-13' },
  [CHAIN.STACKS]: { start: '2023-07-27' },
  // Disabled from 2026-08-31: these chains were only served by stats.a11bd.net, which went offline, and have no on-chain source here yet.
  // Solana, Near and Stellar are still live on Allbridge Classic (about 2% of volume over Jun-Aug 2026).
  // [CHAIN.SOLANA]: { start: '2021-11-10' },
  // [CHAIN.NEAR]: { start: '2022-02-01' },
  // [CHAIN.STELLAR]: { start: '2022-12-30' },
  // The chains below are no longer in Allbridge Classic's network list and had no volume from Oct 2025 to Aug 2026.
  // [CHAIN.TERRA]: { start: '2021-12-09' },
  // [CHAIN.AURORA]: { start: '2021-12-14' },
  // [CHAIN.HECO]: { start: '2021-11-13' }, // returned no data since 2025-03-16
  // [CHAIN.FUSE]: { start: '2022-01-01' },
  // [CHAIN.HARMONY]: { start: '2022-01-01' },
  // [CHAIN.TEZOS]: { start: '2022-06-05' },
  // [CHAIN.KLAYTN]: { start: '2022-08-15' },
  // [CHAIN.WAVES]: { start: '2022-09-15' },
}

const txHashOf = (log: any): string => (log.transactionHash ?? log.transaction_hash).toLowerCase()

async function fetchEvmSends(options: FetchOptions) {
  const volume = options.createBalances()
  const fees = options.createBalances()

  const sentLogs = await options.getLogs({ target: EVM_BRIDGE, eventAbi: SENT_EVENT, onlyArgs: false })
  if (!sentLogs.length) return { volume, fees }

  // Sent names the token by its origin chain and address, tokenSourceMap resolves the token on this chain
  const tokenKeys = [...new Set(sentLogs.map((log: any) => `${log.args.tokenSource}:${log.args.tokenSourceAddress}`))]
  const localTokens: string[] = await options.api.multiCall({
    target: EVM_BRIDGE,
    abi: TOKEN_SOURCE_MAP_ABI,
    calls: tokenKeys.map((key) => ({ params: key.split(':') })),
  })
  const tokenByKey: Record<string, string> = {}
  tokenKeys.forEach((key, i) => { tokenByKey[key] = localTokens[i] })

  for (const log of sentLogs) {
    const token = tokenByKey[`${log.args.tokenSource}:${log.args.tokenSourceAddress}`]
    // a token removed from the bridge before the window end no longer resolves and cannot be priced
    if (token === ZERO_ADDRESS) {
      console.error(`allbridge-classic: unresolved token ${log.args.tokenSource}:${log.args.tokenSourceAddress} on ${options.chain}, tx ${txHashOf(log)}`)
      continue
    }
    volume.add(token, log.args.amount)
  }

  // lock() sends the fee from the user to feeCollector in the same call; feeCollector also receives relayer unlock fees,
  // so only transfers inside Send transactions are kept. lockBase() pays the fee in the native coin, which emits no log.
  const feeCollector: string = await options.api.call({ target: EVM_BRIDGE, abi: 'address:feeCollector' })
  const sendTxs = new Set(sentLogs.map(txHashOf))
  const feeTokens = [...new Set(Object.values(tokenByKey).filter((token) => token !== ZERO_ADDRESS))]
  const transferLogs = await options.getLogs({
    targets: feeTokens,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, null as any, '0x' + feeCollector.slice(2).toLowerCase().padStart(64, '0')],
    onlyArgs: false,
    flatten: false,
  })
  transferLogs.forEach((logs: any[], i: number) => {
    logs.filter((log) => sendTxs.has(txHashOf(log))).forEach((log) => fees.add(feeTokens[i], log.args.value))
  })

  return { volume, fees }
}

async function fetchStacksSends(options: FetchOptions) {
  const volume = options.createBalances()
  const fees = options.createBalances()
  const bridges = STACKS_BRIDGES.map((bridge) => `'${bridge}'`).join(', ')

  // lock() moves the fee from the user to the fee collector and the rest to the bridge (wrapped tokens burn on that transfer)
  // later_txs guards against Allium ingestion lag: an empty window only counts once later Stacks transactions are indexed
  const rows: { later_txs: number; token: string | null; kind: string | null; amount: string | null }[] = await queryAllium(`
    WITH lock_events AS (
      SELECT
        SPLIT_PART(e.event_contents:asset:asset_id::string, '::', 1) AS token,
        CASE
          WHEN e.event_contents:asset:asset_event_type::string = 'burn'
            OR e.event_contents:asset:recipient::string IN (${bridges}) THEN 'locked'
          WHEN e.event_contents:asset:asset_event_type::string = 'transfer' THEN 'fee'
        END AS kind,
        e.event_contents:asset:amount::number AS amount
      FROM stacks.raw.events e
      JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
      WHERE e.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND e.burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND t.burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.tx_status = 'success'
        AND t.canonical
        AND t.tx_contents:contract_call:contract_id::string IN (${bridges})
        AND t.tx_contents:contract_call:function_name::string = 'lock'
        AND e.event_type = 'fungible_token_asset'
    ),
    ingested AS (
      SELECT COUNT(*) AS later_txs
      FROM stacks.raw.transactions
      WHERE burn_block_time >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp + 6 * 3600})
    )
    SELECT i.later_txs, l.token, l.kind, SUM(l.amount)::string AS amount
    FROM ingested i
    LEFT JOIN lock_events l ON l.kind IS NOT NULL
    GROUP BY 1, 2, 3
  `)

  if (!rows.length || !Number(rows[0].later_txs)) throw new Error(`allbridge-classic: Allium has no Stacks transactions after ${options.endTimestamp} yet`)

  for (const { token, kind, amount } of rows) {
    if (!token || !amount) continue
    if (kind === 'locked') volume.add(token, amount)
    else fees.add(token, amount)
  }

  return { volume, fees }
}

const fetch = async (options: FetchOptions) => {
  const { volume, fees } = options.chain === CHAIN.STACKS ? await fetchStacksSends(options) : await fetchEvmSends(options)

  return {
    dailyVolume: volume,
    dailyFees: fees.clone(1, 'Bridge Fees'),
    dailyRevenue: fees.clone(0.2, 'Bridge Fees'),
    dailyProtocolRevenue: fees.clone(0.2, 'Bridge Fees'),
    dailySupplySideRevenue: fees.clone(0.8, 'Bridge Fees'),
  }
}

const methodology = {
  Volume: "Value of tokens sent through the Allbridge Classic bridge, counted once on the source chain at the amount bridged after the fee. Transfers sent from Solana, Near and Stellar are not tracked since 2026-08-31.",
  Fees: "Bridge fee users pay in the transferred token on each send from the source chain. Sends from Solana, Near and Stellar are not tracked since 2026-08-31.",
  Revenue: "20% of the bridge fees collected on sends, kept by the protocol.",
  ProtocolRevenue: "Protocol receives 20% of the collected bridge fee.",
  SupplySideRevenue: "80% of the collected bridge fee is used for rewards to the stakers",
};

const breakdownMethodology = {
  Fees: {
    "Bridge Fees": "Fees charged to users for each cross-chain token transfer on the source chain.",
  },
  Revenue: {
    "Bridge Fees": "20% of bridge fees kept by the protocol.",
  },
  ProtocolRevenue: {
    "Bridge Fees": "20% of bridge fees collected by the protocol treasury.",
  },
  SupplySideRevenue: {
    "Bridge Fees": "80% of bridge fees distributed as rewards to stakers who provide liquidity.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
}

export default adapter;
