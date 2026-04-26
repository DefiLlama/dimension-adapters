import { gql, request } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics"
import { CHAIN } from "../../helpers/chains"

const chainConfig = {
    [CHAIN.POLYGON]: {
        name: 'Polygon',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-polygon/prod/gn',
        chainId: 137,
        identifier: 'polygon',
        start: '2023-05-28',
    },
    [CHAIN.ARBITRUM]: {
        name: 'Arbitrum',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-arbitrum/prod/gn',
        chainId: 42161,
        identifier: 'arbitrum',
        start: '2023-05-28',
    },
    [CHAIN.BSC]: {
        name: 'Binance',
        subgraphEndpoint: 'https://subgraph-proxy-server-xf2uthetka-as.a.run.app/gateway-arbitrum/GLDP56fPGDz3MtmhtfTkz5CxWiqiNLACVrsJ9RqQeL4U',
        chainId: 56,
        identifier: 'bsc',
        start: '2023-06-28',
    },
    [CHAIN.AVAX]: {
        name: 'Avalanche',
        subgraphEndpoint: 'https://subgraph-proxy-server-xf2uthetka-as.a.run.app/gateway-arbitrum/GZotTj3rQJ8ZqVyodtK8TcnKcUxMgeF7mCJHGPYbu8dA',
        chainId: 43114,
        identifier: 'avax',
        start: '2023-06-28',
    },
    [CHAIN.BASE]: {
        name: 'Base',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-base/prod/gn',
        chainId: 8453,
        identifier: 'base',
        start: '2023-11-06',
    },
    [CHAIN.LINEA]: {
        name: 'Linea',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-linea/prod/gn',
        chainId: 59144,
        identifier: 'linea',
        start: '2023-11-19',
    },
    [CHAIN.METIS]: {
        name: 'Metis',
        subgraphEndpoint: 'https://api.metis.0xgraph.xyz/api/public/b88b5696-b69d-46be-b212-5c55a9b1492f/subgraphs/steer-protocol-metis/prod/gn',
        chainId: 1088,
        identifier: 'metis',
        start: '2024-03-04',
    },
    [CHAIN.MANTA]: {
        name: 'Manta',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-manta/prod/gn',
        chainId: 169,
        identifier: 'manta',
        start: '2023-12-01',
    },
    [CHAIN.MODE]: {
        name: 'Mode',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-mode/prod/gn',
        chainId: 34443,
        identifier: 'mode',
        start: '2024-03-24',
    },
    [CHAIN.CELO]: {
        name: 'Celo',
        subgraphEndpoint: 'https://subgraph-proxy-server-xf2uthetka-as.a.run.app/gateway-arbitrum/BPaFHyfVrhv3pdjGodpQcWggAg1Bcrvc9SFc2t2BXeho',
        chainId: 42220,
        identifier: 'celo',
        start: '2024-08-04'
    },
    // 429 rpc error
    // [CHAIN.FLARE]: {
    //     name: 'Flare',
    //     subgraphEndpoint: 'https://api.goldsky.com/api/public/project_cm2k9xbkz4qg901vs51bm5uau/subgraphs/steer-protocol-flare/prod/gn',
    //     chainId: 14,
    //     identifier: 'flare',
    //     start: '2024-08-04',
    // },
    [CHAIN.ETHEREUM]: {
        name: 'Ethereum',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-mainnet/prod/gn',
        chainId: 1,
        identifier: 'ethereum',
        start: '2025-03-06',
    },
    [CHAIN.KATANA]: {
        name: 'Katana',
        subgraphEndpoint: 'https://subgraph-proxy-server-xf2uthetka-as.a.run.app/gateway-arbitrum/D6CST1Az8c8KvMf8ktcEcWds89YVQxbKG6v8yo7FAzzM',
        chainId: 747474,
        identifier: 'katana',
        start: '2025-07-06',
    },
    [CHAIN.HYPERLIQUID]: {
        name: 'HyperEVM',
        subgraphEndpoint: 'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-hyperevm/prod/gn',
        chainId: 999,
        identifier: 'hyperliquid',
        start: '2025-12-06',
    }
}

const BPS_DIVISOR = 10000;
const feesEarnedEvent = 'event FeesEarned(uint256 amount0Earned, uint256 amount1Earned)';

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const query = gql`{
        vaults(first: 1000, where: {totalLPTokensIssued_not: "0", lastSnapshot_not: "0"}) {
            id
        }
    }`;

    const graphResponse = await request(chainConfig[options.chain].subgraphEndpoint, query);
    const vaults = graphResponse.vaults.map((vault: any) => vault.id);

    const [token0, token1, steerFractionOfFees, strategistFractionOfFees, totalFees] = await Promise.all([
        options.api.multiCall({ abi: 'address:token0', calls: vaults, permitFailure: true }),
        options.api.multiCall({ abi: 'address:token1', calls: vaults, permitFailure: true }),
        options.api.multiCall({ abi: 'uint256:STEER_FRACTION_OF_FEE', calls: vaults, permitFailure: true }),
        options.api.multiCall({ abi: 'uint256:STRATEGIST_FRACTION_OF_FEE', calls: vaults, permitFailure: true }),
        options.api.multiCall({ abi: 'uint256:TOTAL_FEE', calls: vaults, permitFailure: true }),
    ]);

    const feesEarnedLogs = await options.getLogs({
        targets: vaults,
        eventAbi: feesEarnedEvent,
        flatten: false,
    });

    for (let i = 0; i < vaults.length; i++) {
        const token0Address = token0[i];
        const token1Address = token1[i];
        const steerFractionOfFeesValue = steerFractionOfFees[i];
        const strategistFractionOfFeesValue = strategistFractionOfFees[i];
        const totalFeesValue = totalFees[i];

        if (!token0Address || !token1Address || !steerFractionOfFeesValue || !strategistFractionOfFeesValue || !totalFeesValue)
            continue;

        const steerFractionInTotalFees = (totalFeesValue / BPS_DIVISOR) * (steerFractionOfFeesValue / BPS_DIVISOR);
        const strategistFractionInTotalFees = (totalFeesValue / BPS_DIVISOR) * (strategistFractionOfFeesValue / BPS_DIVISOR);
        const lpsFractionInTotalFees = 1 - steerFractionInTotalFees - strategistFractionInTotalFees;

        feesEarnedLogs[i].forEach((log: any) => {
            const amount0Earned = Number(log.amount0Earned);
            const amount1Earned = Number(log.amount1Earned);

            dailyFees.add(token0Address, amount0Earned, METRIC.SWAP_FEES);
            dailyFees.add(token1Address, amount1Earned, METRIC.SWAP_FEES);

            dailyRevenue.add(token0Address, amount0Earned * steerFractionInTotalFees, 'Swap fees to protocol');
            dailyRevenue.add(token1Address, amount1Earned * steerFractionInTotalFees, 'Swap fees to protocol');

            dailySupplySideRevenue.add(token0Address, amount0Earned * lpsFractionInTotalFees, 'Swap fees to LPs');
            dailySupplySideRevenue.add(token1Address, amount1Earned * lpsFractionInTotalFees, 'Swap fees to LPs');

            dailySupplySideRevenue.add(token0Address, amount0Earned * strategistFractionInTotalFees, 'Swap fees to strategist');
            dailySupplySideRevenue.add(token1Address, amount1Earned * strategistFractionInTotalFees, 'Swap fees to strategist');
        });

    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,

    }

}

const methodology = {
    Fees: 'Includes swap fees earned by providing liquidity to various pools of different protocols.',
    Revenue: 'Part of swap fees collected as revenue for the protocol.',
    ProtocolRevenue: 'Part of swap fees collected as revenue for the protocol.',
    SupplySideRevenue: 'Includes strategist share and LPs share of the swap fees.',
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: 'Includes swap fees earned by providing liquidity to various pools of different protocols.',
    },
    Revenue: {
        ['Swap fees to protocol']: 'Part of swap fees collected as revenue for the protocol.',
    },
    ProtocolRevenue: {
        ['Swap fees to protocol']: 'Part of swap fees collected as revenue for the protocol.',
    },
    SupplySideRevenue: {
        ['Swap fees to LPs']: 'Includes LPs share of the swap fees.',
        ['Swap fees to strategist']: 'Includes strategist share of the swap fees.',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: Object.keys(chainConfig),
    start: '2023-05-30',
    methodology,
    breakdownMethodology,
    doublecounted: true, //dexs
}

export default adapter;