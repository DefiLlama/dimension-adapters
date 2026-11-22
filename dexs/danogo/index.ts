import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from "../../helpers/prices";
import fetchURL, { httpPost } from "../../utils/fetchURL";

// Danogo concentrated-liquidity pool validator, https://dex-indexer.api.danogo.io/api/v1/concentrated/smart-contracts
// Each pool is a UTxO at this payment credential holding a pool NFT minted under the same policy.
const POOL_SCRIPT = 'd8b69fc53637bcfadbc4469083f706bc293f4d9d2296646c5ca167bb';
const KOIOS = 'https://api.koios.rest/api/v1';
const ADA = ADDRESSES.cardano.ADA;

const FLAT_SWAP_FEES = 'Flat Swap Fees';
const SWAP_FEES_TO_PROTOCOL = 'Swap Fees To Protocol';
const FLAT_SWAP_FEES_TO_PROTOCOL = 'Flat Swap Fees To Protocol';
const SWAP_FEES_TO_LPS = 'Swap Fees To LPs';

// PoolDatum layout: https://docs.dano.finance (Concentrated Pool > Swap)
function readPool(utxo: any) {
    const fields = utxo.inline_datum?.value?.fields;
    const nft = utxo.asset_list.find((asset: any) => asset.policy_id === POOL_SCRIPT && asset.quantity === '1');
    if (utxo.payment_addr?.cred !== POOL_SCRIPT || !nft || fields?.length !== 12) return;
    const [tokenX, tokenY] = [fields[0], fields[1]].map((field: any) => field.list.map((part: any) => part.bytes).join('') || ADA);
    const flatFees = BigInt(fields[5].int);
    const reserve = (token: string) => token === ADA
        ? BigInt(utxo.value) - flatFees
        : BigInt(utxo.asset_list.find((asset: any) => asset.policy_id + asset.asset_name === token)?.quantity ?? 0);
    return {
        nft: nft.asset_name as string, tokenX, tokenY, x: reserve(tokenX), y: reserve(tokenY),
        lpFeeRate: BigInt(fields[2].int), platformFeeX: BigInt(fields[3].int), platformFeeY: BigInt(fields[4].int), flatFees,
    };
}

async function getPoolTxs(options: FetchOptions): Promise<{ inputs: any[], outputs: any[] }[]> {
    const [tip] = await fetchURL(`${KOIOS}/tip`);
    if (tip.block_time < options.endTimestamp) throw new Error(`Koios is behind: tip at ${tip.block_time}, window ends ${options.endTimestamp}`);

    const txHashes: string[] = [];
    for (let offset = 0; ; offset += 1000) {
        const page = await httpPost(
            `${KOIOS}/credential_txs?block_time=gte.${options.startTimestamp}&block_time=lt.${options.endTimestamp}&select=tx_hash&order=tx_hash.asc&offset=${offset}&limit=1000`,
            { _payment_credentials: [POOL_SCRIPT] },
        );
        txHashes.push(...page.map((tx: any) => tx.tx_hash));
        if (page.length < 1000) break;
    }

    const txs = [];
    for (let i = 0; i < txHashes.length; i += 50)
        txs.push(...await httpPost(`${KOIOS}/tx_info`, { _tx_hashes: txHashes.slice(i, i + 50), _inputs: true, _assets: true, _scripts: true }));
    return txs;
}

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    for (const tx of await getPoolTxs(options)) {
        const poolsIn = new Map<string, NonNullable<ReturnType<typeof readPool>>>();
        for (const pool of tx.inputs.map(readPool)) if (pool) poolsIn.set(pool.nft, pool);

        for (const poolOut of tx.outputs.map(readPool)) {
            const poolIn = poolOut && poolsIn.get(poolOut.nft);
            if (!poolIn) continue;
            const changeX = poolOut.x - poolIn.x, changeY = poolOut.y - poolIn.y;
            if (changeX * changeY >= 0n) continue; // liquidity change, not a swap

            const xIn = changeX > 0n;
            const tokenIn = xIn ? poolOut.tokenX : poolOut.tokenY;
            const amountIn = xIn ? changeX : changeY;
            const lpFee = amountIn * poolIn.lpFeeRate / 10000n; // includes the platform share
            const platformFee = xIn ? poolOut.platformFeeX - poolIn.platformFeeX : poolOut.platformFeeY - poolIn.platformFeeY;
            const flatFee = poolOut.flatFees - poolIn.flatFees;

            addOneToken({
                balances: dailyVolume,
                token0: tokenIn, amount0: amountIn,
                token1: xIn ? poolOut.tokenY : poolOut.tokenX, amount1: xIn ? -changeY : -changeX,
            });
            dailyFees.add(tokenIn, Number(lpFee), METRIC.SWAP_FEES);
            dailyFees.add(ADA, Number(flatFee), FLAT_SWAP_FEES);
            dailyRevenue.add(tokenIn, Number(platformFee), SWAP_FEES_TO_PROTOCOL);
            dailyRevenue.add(ADA, Number(flatFee), FLAT_SWAP_FEES_TO_PROTOCOL);
            dailySupplySideRevenue.add(tokenIn, Number(lpFee - platformFee), SWAP_FEES_TO_LPS);
        }
    }

    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.CARDANO],
    start: '2026-03-10',
    methodology: {
        Volume: 'Value of tokens swapped through Danogo concentrated-liquidity pools, each pool swap counted at its ADA or stablecoin side.',
        Fees: 'Swap fees paid by traders on Danogo concentrated-liquidity pools (each pool\'s LP fee rate on the amount swapped in), plus the flat ADA fee charged on every pool swap.',
        Revenue: 'The platform share of swap fees (10% by default) plus the flat ADA fee charged on every pool swap, kept by Danogo.',
        ProtocolRevenue: 'The platform share of swap fees (10% by default) plus the flat ADA fee charged on every pool swap, sent to Danogo.',
        SupplySideRevenue: 'Swap fees left to liquidity providers after the platform share.',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.SWAP_FEES]: 'LP fee rate of the pool applied to the amount swapped in.',
            [FLAT_SWAP_FEES]: 'Flat ADA fee added to the pool datum on every pool swap.',
        },
        Revenue: {
            [SWAP_FEES_TO_PROTOCOL]: 'Platform share of swap fees, accumulated in the pool datum.',
            [FLAT_SWAP_FEES_TO_PROTOCOL]: 'Flat ADA fee per pool swap, collected by the platform.',
        },
        ProtocolRevenue: {
            [SWAP_FEES_TO_PROTOCOL]: 'Platform share of swap fees, accumulated in the pool datum.',
            [FLAT_SWAP_FEES_TO_PROTOCOL]: 'Flat ADA fee per pool swap, collected by the platform.',
        },
        SupplySideRevenue: {
            [SWAP_FEES_TO_LPS]: 'Swap fees left in the pool for liquidity providers.',
        },
    },
};

export default adapter;
