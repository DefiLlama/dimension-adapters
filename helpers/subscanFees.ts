import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types"
import { httpGet, httpPost, postURL } from "../utils/fetchURL"
import { sleep } from "../utils/utils"
import { CHAIN } from "./chains"
import { getEnv } from "./env"

interface SubscanConfig {
    subscanName: string;
    CGToken: string;
    start: string;
    decimals: number;
    burnRatio: number;
}

export const subscanConfigMap: Record<string, SubscanConfig> = {
    [CHAIN.POLKADOT]: { subscanName: 'polkadot', CGToken: 'polkadot', start: '2020-04-19', decimals: 10, burnRatio: 0 },
    [CHAIN.PENDULUM]: { subscanName: 'pendulum', CGToken: 'pendulum-chain', start: '2023-02-15', decimals: 12, burnRatio: 0 },
    [CHAIN.PEAQ]: { subscanName: 'peaq', CGToken: 'peaq-2', start: '2024-06-12', decimals: 18, burnRatio: 0 },
    [CHAIN.NEUROWEB]: { subscanName: 'neuroweb', CGToken: 'neurowebai', start: '2024-04-21', decimals: 12, burnRatio: 0 },
    [CHAIN.MYTHOS]: { subscanName: 'mythos', CGToken: 'mythos', start: '2024-07-17', decimals: 18, burnRatio: 1 },
    [CHAIN.MOONBEAM]: { subscanName: 'moonbeam', CGToken: 'moonbeam', start: '2022-06-20', decimals: 18, burnRatio: 1 },
    [CHAIN.HEIMA]: { subscanName: 'heima', CGToken: 'heima', start: '2025-02-14', decimals: 18, burnRatio: 1 },
    [CHAIN.KARURA]: { subscanName: 'karura', CGToken: 'karura', start: '2021-07-27', decimals: 12, burnRatio: 0.2 },
    [CHAIN.KUSAMA]: { subscanName: 'kusama', CGToken: 'kusama', start: '2020-07-18', decimals: 12, burnRatio: 0.2 },
    [CHAIN.HYDRADX]: { subscanName: 'hydration', CGToken: 'hydradx', start: '2022-04-07', decimals: 12, burnRatio: 0 },
    [CHAIN.ROBONOMICS]: { subscanName: 'robonomics', CGToken: 'robonomics-network', start: '2024-12-13', decimals: 9, burnRatio: 0 },
    [CHAIN.DARWINIA]: { subscanName: 'darwinia', CGToken: 'darwinia-network-native-token', start: '2023-04-26', decimals: 18, burnRatio: 1 },
    [CHAIN.BIFROST]: { subscanName: 'bifrost', CGToken: 'bifrost-native-coin', start: '2024-11-08', decimals: 12, burnRatio: 0.1 },
}

// Asset Hub Migration moved balances, staking and governance from the relay chain to Asset Hub (Kusama 2025-10-07, Polkadot
// 2025-11-04), so user transactions pay their fees on Asset Hub since then and the relay chain fees dropped to ~0.
// From the migration day both chains come from the SQD portal (keyless, decoded events) instead of Subscan: the sum of
// TransactionPayment.TransactionFeePaid, whose actualFee includes the tip and also covers pallet-revive eth_transact. On the relay
// chain it matched Subscan's daily Fee to the planck (polkadot 2026-11-10), and unlike Subscan (our key gets 403
// history_window_exceeded for days older than ~3 months) it can refill every day since the migration.
// Not counted: fees paid in other assets (AssetTxPayment.AssetTxFeePaid, <0.1% of the value on 2026-11-14) and XCM delivery fees.
// Where the fees go (OnChargeTransaction in https://github.com/polkadot-fellows/runtimes):
// - relay chain: DealWithFees (polkadot-sdk runtime/common), fees 80% to the treasury and 20% to the block author, tips 100% to the author
// - Asset Hub: everything to the collator staking pot (modlPotStake). On Polkadot, runtime v2.3.0 made the DAP staging account the
//   sink instead (CHANGELOG: "DapStagingAccount is the sink for fees"); pallet-dap moves it into the DAP buffer, a
//   governance-controlled reserve, while staking rewards are now minted by the DAP drip. Kusama still uses the staking pot.
// firstBlock: a block shortly before the migration, the lower bound of the block-by-timestamp search
type PortalChain = { dataset: string; rpc: string; firstBlock: number }
const assetHubMigrationConfigMap: Record<string, { name: string; start: string; relay: PortalChain; assetHub: PortalChain; dapFromBlock?: number }> = {
    [CHAIN.POLKADOT]: {
        name: 'Polkadot',
        start: '2025-11-04',
        relay: { dataset: 'polkadot', rpc: 'https://rpc.polkadot.io', firstBlock: 28_000_000 }, // 2025-10-01
        assetHub: { dataset: 'asset-hub-polkadot', rpc: 'https://polkadot-asset-hub-rpc.polkadot.io', firstBlock: 10_000_000 }, // 2025-10-16
        // v2.3.0 (spec 2003000) was set in block 16,946,479 (2026-06-12 09:42 UTC), so this is the first block it ran. Fees went to
        // modlPotStake up to block 16,946,478 and to the DAP account from the next fee event (block 16,946,490)
        dapFromBlock: 16_946_480,
    },
    [CHAIN.KUSAMA]: {
        name: 'Kusama',
        start: '2025-10-07',
        relay: { dataset: 'kusama', rpc: 'https://kusama-rpc.polkadot.io', firstBlock: 30_000_000 }, // 2025-09-07
        assetHub: { dataset: 'asset-hub-kusama', rpc: 'https://kusama-asset-hub-rpc.polkadot.io', firstBlock: 11_000_000 }, // 2025-09-25
    },
}
const DAP_START = '2026-06-12'
// the SQD portal's finalized head runs ~2h behind the chain, so a day is fetched only from 2 hours after it ends (UTC)
const PORTAL_DELAY = 2 * 3600

const LABEL = {
    RELAY_FEES: 'Relay Chain Transaction Fees',
    ASSET_HUB_FEES: 'Asset Hub Transaction Fees',
    RELAY_TO_TREASURY: 'Relay Chain Transaction Fees To Treasury',
    RELAY_TO_AUTHORS: 'Relay Chain Transaction Fees To Block Authors',
    ASSET_HUB_TO_COLLATORS: 'Asset Hub Transaction Fees To Collators',
    ASSET_HUB_TO_DAP: 'Asset Hub Transaction Fees To DAP Buffer',
}

// Timestamp.Now = twox128("Timestamp") ++ twox128("Now")
const TIMESTAMP_NOW_KEY = '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb'

// JSON-RPC batch: one HTTP request for all calls, results in call order
async function rpcBatch(rpc: string, calls: [string, any[]][]): Promise<any[]> {
    const res = await postURL(rpc, calls.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params })))
    if (!Array.isArray(res) || res.length !== calls.length) throw new Error(`${rpc}: bad batch response ${JSON.stringify(res).slice(0, 200)}`)
    const results: any[] = []
    for (const r of res) {
        if (r.error) throw new Error(`${rpc} ${calls[r.id]?.[0]} failed: ${JSON.stringify(r.error)}`)
        results[r.id] = r.result
    }
    return results
}

function decodeTimestamp(value: string | null, where: string): number {
    if (!value) throw new Error(`no timestamp at ${where}`)
    return Number(Buffer.from(value.slice(2), 'hex').readBigUInt64LE(0)) / 1000 // u64 milliseconds
}

// Timestamp.Now of each block: two batched calls (block hashes, then storage reads at those hashes)
async function blockTimes(rpc: string, blocks: number[]): Promise<number[]> {
    const hashes = await rpcBatch(rpc, blocks.map((block) => ['chain_getBlockHash', [block]]))
    hashes.forEach((hash, i) => { if (!hash) throw new Error(`${rpc}: no hash for block ${blocks[i]}`) })
    const values = await rpcBatch(rpc, hashes.map((hash) => ['state_getStorage', [TIMESTAMP_NOW_KEY, hash]]))
    return values.map((value, i) => decodeTimestamp(value, `${rpc} block ${blocks[i]}`))
}

const PROBES_PER_RANGE = 31

// for each timestamp, the first block whose Timestamp.Now is >= it (timestamps never decrease, several blocks can share one).
// Searches between `first` (before all of them) and the finalized head; each round reads PROBES_PER_RANGE evenly spaced blocks
// in every open range and narrows it 32x, so a ~15M block range closes in 5 rounds of 2 batched calls
async function firstBlocksAtOrAfter(rpc: string, timestamps: number[], first: number): Promise<number[]> {
    const [headHash] = await rpcBatch(rpc, [['chain_getFinalizedHead', []]])
    const [header, headTime] = await rpcBatch(rpc, [['chain_getHeader', [headHash]], ['state_getStorage', [TIMESTAMP_NOW_KEY, headHash]]])
    const head = { block: parseInt(header.number, 16), time: decodeTimestamp(headTime, `${rpc} finalized head`) }
    const latest = Math.max(...timestamps)
    if (head.time < latest) throw new Error(`${rpc}: finalized head ${head.block} (${head.time}) is before ${latest}`)

    // invariant: time(lo) < timestamp <= time(hi); time(first) is checked in the first round
    const ranges = timestamps.map(() => ({ lo: first, hi: head.block }))
    for (let round = 0; round === 0 || ranges.some(({ lo, hi }) => hi - lo > 1); round++) {
        const probes = new Set<number>(round === 0 ? [first] : [])
        for (const { lo, hi } of ranges)
            if (hi - lo > 1)
                for (let k = 1; k <= PROBES_PER_RANGE; k++) probes.add(lo + Math.max(1, Math.floor(((hi - lo) * k) / (PROBES_PER_RANGE + 1))))
        const blocks = [...probes].filter((block) => block < head.block).sort((a, b) => a - b)
        const times = await blockTimes(rpc, blocks)
        if (round === 0 && times[0] >= Math.min(...timestamps)) throw new Error(`${rpc}: block ${first} (${times[0]}) is not before ${Math.min(...timestamps)}`)
        ranges.forEach((range, i) => blocks.forEach((block, j) => {
            if (block <= range.lo || block >= range.hi) return
            if (times[j] < timestamps[i]) range.lo = block
            else range.hi = block // blocks are ascending, so later ones fall outside the narrowed range
        }))
    }
    return ranges.map(({ hi }) => hi)
}

// the public portal often answers 529 (overloaded) for minutes, or 429, so retry everything but the other 4xx with a capped backoff
async function portalStream(dataset: string, query: any): Promise<any[]> {
    for (let i = 0; ; i++) {
        try {
            const text: string = await httpPost(`https://portal.sqd.dev/datasets/${dataset}/stream`, { type: 'substrate', ...query }, { responseType: 'text', timeout: 120_000, validateStatus: (status: number) => status === 200 }, { withMetadata: true })
            return text.trim().split('\n').map((line) => JSON.parse(line))
        } catch (e: any) {
            const status = e.response?.status
            if (i >= 6 || (status >= 400 && status < 500 && status !== 429)) throw e
            await sleep(Math.min(60_000, 2000 * 2 ** i) * (0.5 + Math.random()))
        }
    }
}

// TransactionPayment.TransactionFeePaid over the blocks of the UTC day, in planck: actualFee (includes the tip), the tips, and the
// actualFee paid in blocks >= splitBlock
async function getFeesPaid({ dataset, rpc, firstBlock }: PortalChain, options: FetchOptions, splitBlock = Infinity) {
    const [fromBlock, nextDayBlock] = await firstBlocksAtOrAfter(rpc, [options.startOfDay, options.startOfDay + 86400], firstBlock)
    const toBlock = nextDayBlock - 1

    const portalHead = (await httpGet(`https://portal.sqd.dev/datasets/${dataset}/finalized-head`)).number
    if (portalHead < toBlock) throw new Error(`${dataset}: portal finalized head ${portalHead} is behind block ${toBlock}`)

    // the portal returns the range in chunks, one line per block, so continue after the last block it sent (includeAllBlocks:
    // without it, a range whose last blocks have no fee event can come back empty)
    let fees = 0n, tips = 0n, feesFromSplit = 0n
    let next = fromBlock
    while (next <= toBlock) {
        const blocks = await portalStream(dataset, {
            fromBlock: next,
            toBlock,
            includeAllBlocks: true,
            fields: { block: { number: true }, event: { name: true, args: true } },
            events: [{ name: ['TransactionPayment.TransactionFeePaid'] }],
        })
        const last = blocks[blocks.length - 1]?.header?.number
        if (!(last >= next)) throw new Error(`${dataset}: portal returned no blocks from ${next} to ${toBlock}`)
        for (const block of blocks)
            for (const event of block.events ?? []) {
                const fee = BigInt(event.args.actualFee)
                fees += fee
                tips += BigInt(event.args.tip)
                if (block.header.number >= splitBlock) feesFromSplit += fee
            }
        next = last + 1
    }
    return { fees, tips, feesFromSplit }
}

// relay chain + Asset Hub fees from the Asset Hub Migration day on, split by where the runtime sends them (see assetHubMigrationConfigMap)
async function fetchAfterAssetHubMigration(chain: string, options: FetchOptions) {
    const readyAt = options.startOfDay + 86400 + PORTAL_DELAY
    if (Date.now() / 1000 < readyAt) throw new Error(`${chain} ${options.dateString}: not ready until ${new Date(readyAt * 1000).toISOString()}, the SQD portal runs ~2h behind the chain`)

    const { CGToken, decimals } = subscanConfigMap[chain]
    const { relay, assetHub, dapFromBlock } = assetHubMigrationConfigMap[chain]
    const toToken = (planck: bigint) => Number(planck) / 10 ** decimals

    const relayPaid = await getFeesPaid(relay, options)
    const assetHubPaid = await getFeesPaid(assetHub, options, dapFromBlock)
    const relayToTreasury = (relayPaid.fees - relayPaid.tips) * 80n / 100n // fees 80% treasury / 20% author, tips 100% author

    const dailyFees = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    dailyFees.addCGToken(CGToken, toToken(relayPaid.fees), LABEL.RELAY_FEES)
    dailyFees.addCGToken(CGToken, toToken(assetHubPaid.fees), LABEL.ASSET_HUB_FEES)
    dailyProtocolRevenue.addCGToken(CGToken, toToken(relayToTreasury), LABEL.RELAY_TO_TREASURY)
    dailySupplySideRevenue.addCGToken(CGToken, toToken(relayPaid.fees - relayToTreasury), LABEL.RELAY_TO_AUTHORS)
    dailySupplySideRevenue.addCGToken(CGToken, toToken(assetHubPaid.fees - assetHubPaid.feesFromSplit), LABEL.ASSET_HUB_TO_COLLATORS)
    if (dapFromBlock) dailyProtocolRevenue.addCGToken(CGToken, toToken(assetHubPaid.feesFromSplit), LABEL.ASSET_HUB_TO_DAP)

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue.clone(),
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue: options.createBalances(), // no transaction fee is burned on either chain since the migration
    }
}

export function subscanFeeAdapter(chain: string) {
    const config = subscanConfigMap[chain]
    if (!config) throw new Error(`No subscan config for chain ${chain}`)
    const { CGToken, start, decimals, subscanName } = config

    if (!subscanName || !CGToken || !start || !decimals) throw new Error(`Invalid subscan config for chain ${chain}`)
    const url = `https://${subscanName}.api.subscan.io/api/v2/scan/daily`


    const adapter: Adapter = {
        version: 1,
        adapter: {
            [chain]: {
                fetch: async (options: FetchOptions) => {
                    const assetHubMigration = assetHubMigrationConfigMap[chain]
                    if (assetHubMigration && options.dateString >= assetHubMigration.start) return fetchAfterAssetHubMigration(chain, options)

                    const apikey = getEnv('SUBSCAN_API_KEY')
                    if (!apikey) throw new Error('SUBSCAN_API_KEY is not set')

                    const dailyFees = options.createBalances()

                    const subscanResponse = await httpPost(url, {
                        category: "Fee",
                        start: options.dateString,
                        end: options.dateString,
                        format: "day"
                    },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'X-API-Key': apikey
                            }
                        }
                    )

                    if (subscanResponse.code !== 0 || !subscanResponse.data || !subscanResponse.data.list || !subscanResponse.data.list.length)
                        throw new Error(`No data returned from Subscan for chain ${chain} on date ${options.dateString}`)

                    const todaysData = subscanResponse.data.list.find((d: any) => d.time_utc === `${options.dateString}T00:00:00Z`);

                    if (!todaysData)
                        throw new Error(`No data returned from Subscan for chain ${chain} on date ${options.dateString}`)

                    dailyFees.addCGToken(CGToken, Number(todaysData.total) / (10 ** decimals))

                    if (config.burnRatio !== undefined && config.burnRatio !== null) {
                        const burnRatio = (chain === CHAIN.MOONBEAM && options.dateString <= '2025-03-13') ? 0.8 : config.burnRatio;
                        const dailyRevenue = dailyFees.clone(burnRatio);
                        return {
                            dailyFees,
                            dailyRevenue,
                            dailyHoldersRevenue: dailyRevenue
                        }
                    }

                    return {
                        dailyFees,
                    }
                },
                start,
            }
        },
        protocolType: ProtocolType.CHAIN
    }

    const assetHubMigration = assetHubMigrationConfigMap[chain]
    if (assetHubMigration) {
        const { name, start: ahmStart, dapFromBlock } = assetHubMigration
        const preMigrationRevenue = config.burnRatio ? `${config.burnRatio * 100}% of relay chain transaction fees` : 'no fees'
        const toDap = dapFromBlock ? `, plus from ${DAP_START} the Asset Hub transaction fees, which the runtime sends to the DAP buffer, a governance-controlled reserve` : ''
        adapter.methodology = {
            Fees: `Transaction fees and tips paid on the ${name} relay chain, plus, from the Asset Hub Migration on ${ahmStart}, the transaction fees and tips paid on ${name} Asset Hub, where user transactions moved. Excludes Asset Hub fees paid in other assets and XCM delivery fees.`,
            Revenue: `Before the Asset Hub Migration on ${ahmStart}, ${preMigrationRevenue}. From then on, the 80% of relay chain transaction fees sent to the treasury${toDap}.`,
            ProtocolRevenue: `From the Asset Hub Migration on ${ahmStart}, the 80% of relay chain transaction fees sent to the treasury${toDap}.`,
            HoldersRevenue: config.burnRatio ? `${config.burnRatio * 100}% of relay chain transaction fees before the Asset Hub Migration on ${ahmStart}. No transaction fees are burned after it.` : 'No transaction fees are burned, so holders revenue is zero.',
            SupplySideRevenue: `From the Asset Hub Migration on ${ahmStart}, the 20% of relay chain transaction fees and all tips paid to block authors, plus the Asset Hub transaction fees and tips paid to the collator staking pot${dapFromBlock ? ` until ${DAP_START}` : ''}.`,
        }
        const toDapBreakdown = dapFromBlock ? { [LABEL.ASSET_HUB_TO_DAP]: `Asset Hub transaction fees and tips from ${DAP_START} (runtime v2.3.0), sent to the DAP buffer, a governance-controlled reserve.` } : {}
        adapter.breakdownMethodology = {
            Fees: {
                [LABEL.RELAY_FEES]: `Transaction fees and tips paid on the ${name} relay chain.`,
                [LABEL.ASSET_HUB_FEES]: `Transaction fees and tips paid in the native token on ${name} Asset Hub, counted from the Asset Hub Migration on ${ahmStart}.`,
            },
            Revenue: {
                [LABEL.RELAY_TO_TREASURY]: '80% of relay chain transaction fees, excluding tips, sent to the treasury.',
                ...toDapBreakdown,
            },
            ProtocolRevenue: {
                [LABEL.RELAY_TO_TREASURY]: '80% of relay chain transaction fees, excluding tips, sent to the treasury.',
                ...toDapBreakdown,
            },
            SupplySideRevenue: {
                [LABEL.RELAY_TO_AUTHORS]: '20% of relay chain transaction fees plus all tips, paid to the block author.',
                [LABEL.ASSET_HUB_TO_COLLATORS]: `Asset Hub transaction fees and tips paid to the collator staking pot${dapFromBlock ? ` until ${DAP_START}` : ''}.`,
            },
        }
    }

    return adapter
}
