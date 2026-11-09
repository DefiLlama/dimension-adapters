import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getCheckpointAtTimestamp, graphqlCall } from "../../helpers/sui";

const DLMM_PACKAGE = '0x5a5c1d10e4782dbbdec3eb8327ede04bd078b294b97cfdba447b11b846b383ac';
const SWAP_EVENT = `${DLMM_PACKAGE}::lb_pair::SwapEvent`;

const PROTOCOL_FEES = 'Swap Fees To Protocol';

const sumBins = (amounts: string[]) => amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const swaps: any[] = [];
    const { sequenceNumber } = await getCheckpointAtTimestamp(options.startTimestamp - 1);
    let after: string | null = null;
    while (true) {
        const { events } = await graphqlCall(`query ($after: String) {
            events(first: 50, after: $after, filter: { type: "${SWAP_EVENT}", afterCheckpoint: ${sequenceNumber} }) {
                pageInfo { hasNextPage endCursor }
                nodes { timestamp contents { json } }
            }
        }`, { after });
        const inWindow = events.nodes.filter((node: any) => Date.parse(node.timestamp) / 1e3 < options.endTimestamp);
        for (const node of inWindow) {
            if (Date.parse(node.timestamp) / 1e3 >= options.startTimestamp) swaps.push(node.contents.json);
        }
        if (inWindow.length < events.nodes.length || !events.pageInfo.hasNextPage) break;
        after = events.pageInfo.endCursor;
    }

    const pairIds = [...new Set(swaps.map((swap) => swap.pair))];
    const pairs = await sdk.chains.sui.getObjects({ objectIds: pairIds, skipLayout: true });
    const pairCoins: Record<string, string[]> = {};
    pairIds.forEach((id, i) => {
        if (!pairs[i]) throw new Error(`Ferra DLMM pair ${id} not found`);
        pairCoins[id] = sdk.chains.sui.parseStructTag(pairs[i]!.type).typeParams;
    });

    for (const swap of swaps) {
        const [coinX, coinY] = pairCoins[swap.pair];
        const [coinIn, amountsIn, totalFees, protocolFees] = swap.swap_for_y
            ? [coinX, swap.amounts_in_x, swap.total_fees_x, swap.protocol_fees_x]
            : [coinY, swap.amounts_in_y, swap.total_fees_y, swap.protocol_fees_y];
        const fees = sumBins(totalFees);
        const protocolFee = sumBins(protocolFees);

        dailyVolume.add(coinIn, sumBins(amountsIn));
        dailyFees.add(coinIn, fees, METRIC.SWAP_FEES);
        dailyRevenue.add(coinIn, protocolFee, PROTOCOL_FEES);
        dailySupplySideRevenue.add(coinIn, fees - protocolFee, METRIC.LP_FEES);
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(),
        dailySupplySideRevenue,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    start: '2025-10-07',
    chains: [CHAIN.SUI],
    methodology: {
        Volume: 'Input amount of every swap on Ferra DLMM pairs, from on-chain swap events.',
        Fees: 'Swap fees paid by traders on Ferra DLMM pairs.',
        Revenue: 'The protocol share of swap fees (20%) kept by Ferra.',
        ProtocolRevenue: 'The protocol share of swap fees (20%) sent to Ferra.',
        SupplySideRevenue: 'Swap fees paid to liquidity providers (80%).',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.SWAP_FEES]: 'Swap fees paid by traders, charged on the input coin of each swap.',
        },
        Revenue: {
            [PROTOCOL_FEES]: 'Protocol share of swap fees, as recorded per bin in each swap event.',
        },
        ProtocolRevenue: {
            [PROTOCOL_FEES]: 'Protocol share of swap fees, as recorded per bin in each swap event.',
        },
        SupplySideRevenue: {
            [METRIC.LP_FEES]: 'Swap fees left to liquidity providers after the protocol share.',
        },
    },
};

export default adapter;
