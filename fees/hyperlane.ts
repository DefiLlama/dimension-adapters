import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type ChainConfig = {
    start: string;
    duneSchema: string;
    igp: string;
}

const chainConfig: Record<string, ChainConfig> = {
    [CHAIN.ARBITRUM]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_arbitrum",
        igp: "0x3b6044acd6767f017e99318aa6ef93b7b06a5a22",
    },
    [CHAIN.AVAX]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_avalanche_c",
        igp: "0x95519ba800bbd0d34eeae026fec620ad978176c0",
    },
    [CHAIN.BSC]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_bnb",
        igp: "0x78e25e7f84416e69b9339b0a6336eb6efff6b451",
    },
    [CHAIN.BASE]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_base",
        igp: "0xc3f23848ed2e04c0c6d41bd7804fa8f89f940b94",
    },
    [CHAIN.BLAST]: {
        start: "2024-04-25",
        duneSchema: "hyperlane_v3_blast",
        igp: "0xb3fccd379ad66ced0c91028520c64226611a48c9",
    },
    [CHAIN.CELO]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_celo",
        igp: "0x571f1435613381208477ac5d6974310d88ac7cb7",
    },
    [CHAIN.ETHEREUM]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_ethereum",
        igp: "0x9e6b1022be9bbf5afd152483dad9b88911bc8611",
    },
    [CHAIN.XDAI]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_gnosis",
        igp: "0xdd260b99d302f0a3ff885728c086f729c06f227f",
    },
    [CHAIN.LINEA]: {
        start: "2024-06-05",
        duneSchema: "hyperlane_v3_linea",
        igp: "0x8105a095368f1a184ccea86cce21318b5ee5be28",
    },
    [CHAIN.OPTIMISM]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_optimism",
        igp: "0xd8a76c4d91fcbb7cc8ea795dfdf870e48368995c",
    },
    [CHAIN.POLYGON]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_polygon",
        igp: "0x0071740bf129b05c4684abfbbed248d80971cce2",
    },
    [CHAIN.POLYGON_ZKEVM]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_zkevm",
        igp: "0x0d63128d887159d63de29497dfa45afc7c699ae4",
    },
    [CHAIN.SCROLL]: {
        start: "2023-10-25",
        duneSchema: "hyperlane_v3_scroll",
        igp: "0xbf12ef4b9f307463d3fb59c3604f294ddce287e2",
    },
    [CHAIN.MANTLE]: {
        start: "2024-06-25",
        duneSchema: "hyperlane_v3_mantle",
        igp: "0x8105a095368f1a184ccea86cce21318b5ee5be28",
    },
};

const IGP_FEES = "Interchain Gas Payments";

const selectGasPayments = ([chain, config]: [string, ChainConfig], options: FetchOptions) => `
    SELECT
      '${chain}' AS chain,
      payment,
      contract_address = ${config.igp} AS is_hyperlane_relayer
    FROM
      ${config.duneSchema}.InterchainGasPaymaster_evt_GasPayment
    WHERE
      evt_block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND evt_block_time < FROM_UNIXTIME(${options.endTimestamp})
`;

const query = (options: FetchOptions) => {
    const gasPaymentQuery = Object.entries(chainConfig).map((config) => selectGasPayments(config, options)).join("\n    UNION ALL\n");
    return `
    WITH gas_payments AS (${gasPaymentQuery})
    SELECT
        chain,
        SUM(payment) AS payment,
        SUM(IF(is_hyperlane_relayer, payment, 0)) AS hyperlane_payment,
        SUM(IF(is_hyperlane_relayer, 0, payment)) AS other_payment
    FROM gas_payments
    GROUP BY chain
`;
}

const prefetch = (options: FetchOptions) =>
    queryDuneSql(options, query(options), { extraUIDKey: "hyperlane-fees" });

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const event = options.preFetchedResults?.find((row: any) => row.chain === options.chain);
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    if (event?.payment) {
        dailyFees.addGasToken(event.payment, IGP_FEES);
        dailyRevenue.addGasToken(event.hyperlane_payment, IGP_FEES);
        dailySupplySideRevenue.addGasToken(event.other_payment, IGP_FEES);
    }

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    UserFees: "User-paid Hyperlane interchain gas payments from InterchainGasPaymaster GasPayment events.",
    Fees: "User-paid Hyperlane interchain gas payments from InterchainGasPaymaster GasPayment events.",
    SupplySideRevenue: "Gross IGP payments to non-Hyperlane relayer contracts when present.",
    Revenue: "Gross IGP payments to Hyperlane-published relayer contracts.",
    ProtocolRevenue: "Gross IGP payments to Hyperlane-published relayer contracts.",
};

const breakdownMethodology = {
    Fees: {
        [IGP_FEES]: "GasPayment fees from Hyperlane InterchainGasPaymaster.",
    },
    UserFees: {
        [IGP_FEES]: "User paid fees from Hyperlane InterchainGasPaymaster.",
    },
    SupplySideRevenue: {
        [IGP_FEES]: "Gross IGP payments to non-Hyperlane relayer contracts when present.",
    },
    Revenue: {
        [IGP_FEES]: "Gross IGP payments to Hyperlane-published relayer contracts.",
    },
    ProtocolRevenue: {
        [IGP_FEES]: "Gross IGP payments to Hyperlane-published relayer contracts.",
    },
};

const adapter: Adapter = {
    version: 1,
    adapter: chainConfig,
    prefetch,
    fetch,
    methodology,
    breakdownMethodology,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
};

export default adapter;
