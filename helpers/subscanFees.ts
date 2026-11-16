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
}

// Asset Hub Migration moved balances, staking and governance from the relay chain to Asset Hub (Kusama 2025-10-07, Polkadot
// 2025-11-04), so user transactions now pay their fees on Asset Hub and the relay chain fees from Subscan dropped to ~0.
// Asset Hub burns none of it: the runtime sends fees to the collator staking pot (Polkadot since runtime v2.3.0: the DAP staging
// account, which funds staking rewards), see OnChargeTransaction in
// https://github.com/polkadot-fellows/runtimes/tree/main/system-parachains/asset-hubs
// Source: SQD portal (keyless, decoded events) for TransactionPayment.TransactionFeePaid, whose actualFee includes the tip and
// also covers pallet-revive eth_transact. Fees paid in other assets (AssetTxPayment.AssetTxFeePaid, <0.1% of the value on 2026-11-14) are not counted.
// firstBlock: a block shortly before the migration, where the block search starts (the earliest blocks have no Timestamp.Now)
const assetHubConfigMap: Record<string, { dataset: string; rpc: string; start: string; firstBlock: number }> = {
    [CHAIN.POLKADOT]: { dataset: 'asset-hub-polkadot', rpc: 'https://polkadot-asset-hub-rpc.polkadot.io', start: '2025-11-04', firstBlock: 10_000_000 }, // 2025-10-16
    [CHAIN.KUSAMA]: { dataset: 'asset-hub-kusama', rpc: 'https://kusama-asset-hub-rpc.polkadot.io', start: '2025-10-07', firstBlock: 11_000_000 }, // 2025-09-25
}

// Timestamp.Now = twox128("Timestamp") ++ twox128("Now")
const TIMESTAMP_NOW_KEY = '0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb'

async function substrateRpc(rpc: string, method: string, params: any[]) {
    const res = await postURL(rpc, { jsonrpc: '2.0', id: 1, method, params })
    if (res.error) throw new Error(`${rpc} ${method} failed: ${JSON.stringify(res.error)}`)
    return res.result
}

async function blockTime(rpc: string, block: number): Promise<number> {
    const hash = await substrateRpc(rpc, 'chain_getBlockHash', [block])
    const value: string | null = await substrateRpc(rpc, 'state_getStorage', [TIMESTAMP_NOW_KEY, hash])
    if (!value) throw new Error(`${rpc}: no timestamp at block ${block}`)
    return Number(Buffer.from(value.slice(2), 'hex').readBigUInt64LE(0)) / 1000 // u64 milliseconds
}

// smallest block whose timestamp is >= ts, by interpolation search with a bisection fallback (timestamps never decrease,
// and several blocks can share one)
async function firstBlockAtOrAfter(rpc: string, ts: number, first: number, head: { block: number; time: number }): Promise<number> {
    if (head.time < ts) throw new Error(`${rpc}: finalized head ${head.block} (${head.time}) is before ${ts}`)
    let lo = { block: first, time: await blockTime(rpc, first) }
    let hi = head
    if (lo.time >= ts) throw new Error(`${rpc}: block ${first} (${lo.time}) is not before ${ts}`)
    for (let i = 0; hi.block - lo.block > 1; i++) {
        let next = Math.floor((lo.block + hi.block) / 2)
        if (i % 2 === 0) {
            const guess = lo.block + Math.floor(((ts - lo.time) * (hi.block - lo.block)) / (hi.time - lo.time))
            next = Math.min(hi.block - 1, Math.max(lo.block + 1, guess))
        }
        const time = await blockTime(rpc, next)
        if (time < ts) lo = { block: next, time }
        else hi = { block: next, time }
    }
    return hi.block
}

// the public portal often answers 529 (overloaded) for minutes, so retry everything but 4xx with a capped backoff
async function portalStream(dataset: string, query: any): Promise<any[]> {
    for (let i = 0; ; i++) {
        try {
            const text: string = await httpPost(`https://portal.sqd.dev/datasets/${dataset}/stream`, { type: 'substrate', ...query }, { responseType: 'text', timeout: 120_000, validateStatus: (status: number) => status === 200 })
            return text.trim().split('\n').map((line) => JSON.parse(line))
        } catch (e: any) {
            if (i >= 12 || /status code 4\d\d/.test(e.message)) throw e
            await sleep(Math.min(60_000, 2000 * 2 ** i) * (0.5 + Math.random()))
        }
    }
}

// TransactionPayment.TransactionFeePaid over the Asset Hub blocks of the day, in planck
async function getAssetHubFees(chain: string, options: FetchOptions): Promise<bigint> {
    const { dataset, rpc, firstBlock } = assetHubConfigMap[chain]
    const finalizedHash = await substrateRpc(rpc, 'chain_getFinalizedHead', [])
    const finalizedBlock = parseInt((await substrateRpc(rpc, 'chain_getHeader', [finalizedHash])).number, 16)
    const head = { block: finalizedBlock, time: await blockTime(rpc, finalizedBlock) }
    const fromBlock = await firstBlockAtOrAfter(rpc, options.startOfDay, firstBlock, head)
    const toBlock = (await firstBlockAtOrAfter(rpc, options.startOfDay + 86400, fromBlock - 1, head)) - 1

    const portalHead = (await httpGet(`https://portal.sqd.dev/datasets/${dataset}/finalized-head`)).number
    if (portalHead < toBlock) throw new Error(`${dataset}: portal finalized head ${portalHead} is behind block ${toBlock}`)

    // the portal returns the range in chunks, one line per block, so continue after the last block it sent
    let fees = 0n
    let next = fromBlock
    while (next <= toBlock) {
        const blocks = await portalStream(dataset, {
            fromBlock: next,
            toBlock,
            fields: { block: { number: true }, event: { name: true, args: true } },
            events: [{ name: ['TransactionPayment.TransactionFeePaid'] }],
        })
        const last = blocks[blocks.length - 1]?.header?.number
        if (!(last >= next)) throw new Error(`${dataset}: portal returned no blocks from ${next} to ${toBlock}`)
        for (const block of blocks)
            for (const event of block.events ?? [])
                fees += BigInt(event.args.actualFee)
        next = last + 1
    }
    return fees
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
                    const relayFees = dailyFees.clone()

                    // Asset Hub fees go to collators / stakers, none is burned
                    let dailySupplySideRevenue
                    if (assetHubConfigMap[chain] && options.dateString >= assetHubConfigMap[chain].start) {
                        dailySupplySideRevenue = options.createBalances()
                        dailySupplySideRevenue.addCGToken(CGToken, Number(await getAssetHubFees(chain, options)) / (10 ** decimals))
                        dailyFees.addBalances(dailySupplySideRevenue)
                    }

                    if (config.burnRatio !== undefined && config.burnRatio !== null) {
                        const burnRatio = (chain === CHAIN.MOONBEAM && options.dateString <= '2025-03-13') ? 0.8 : config.burnRatio;
                        const dailyRevenue = relayFees.clone(burnRatio);
                        return {
                            dailyFees,
                            dailyRevenue,
                            dailyHoldersRevenue: dailyRevenue,
                            ...(dailySupplySideRevenue && { dailySupplySideRevenue }),
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

    if (assetHubConfigMap[chain]) adapter.methodology = {
        Fees: `Transaction fees and tips paid on the relay chain, plus from ${assetHubConfigMap[chain].start} (Asset Hub Migration) the transaction fees and tips paid on Asset Hub, where user transactions moved. Excludes Asset Hub fees paid in assets other than the native token, and XCM delivery fees.`,
        Revenue: config.burnRatio ? `${config.burnRatio * 100}% of relay chain transaction fees (the burn ratio this helper uses for the chain).` : 'No fees are burned, so revenue is zero.',
        HoldersRevenue: config.burnRatio ? `${config.burnRatio * 100}% of relay chain transaction fees (the burn ratio this helper uses for the chain).` : 'No fees are burned, so holders revenue is zero.',
        SupplySideRevenue: 'Asset Hub transaction fees and tips, paid to the collator staking pot (Polkadot from runtime v2.3.0: the DAP staging account, which funds staking rewards). None is burned.',
    }

    return adapter
}
