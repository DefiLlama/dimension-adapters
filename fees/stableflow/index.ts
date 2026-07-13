import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// StableFlow's app-fee recipient on NEAR Intents (1Click appFees)
// https://github.com/stableflow-ai/stableflow-interface/blob/main/src/services/oneclick/index.ts#L14
const APP_FEE_WALLET = "reffer.near";

// StableFlow's CCTP depositForBurn wrapper contracts - they retain a custom fee at deposit.
// Circle's own fast-transfer fee is tracked under the `cctp` adapter and excluded here.
// proxy addresses: https://github.com/stableflow-ai/stableflow-interface/blob/main/src/services/cctp/contract.ts
// usdc addresses: https://developers.circle.com/stablecoins/usdc-contract-addresses
const CCTP_PROXY: Record<string, { proxy: string; usdc: string }> = {
    [CHAIN.ETHEREUM]: { proxy: "0x54Cf68aB8f68813F2a2dF20Af72D19c44485a0b2", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    [CHAIN.ARBITRUM]: { proxy: "0x54Cf68aB8f68813F2a2dF20Af72D19c44485a0b2", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    [CHAIN.OPTIMISM]: { proxy: "0x54Cf68aB8f68813F2a2dF20Af72D19c44485a0b2", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
    [CHAIN.POLYGON]: { proxy: "0x7A18854b695BA7efB7229c17D0E1Cd2679481D28", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
    [CHAIN.AVAX]: { proxy: "0xB6E3a1165aC3E0c370e316C27E959482460dBeDD", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    [CHAIN.BASE]: { proxy: "0x7092B8E5445Fca836B0f9780c77C38C7cbb9A43D", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
};

// Deposit event of the proxy:
// data words = [user, originalAmount, chargedAmount, fee, destinationDomain]
const CCTP_DEPOSIT_TOPIC = "0x42c0c9c66992c2a0a65fe5553915218cdf833f9d9544a2dabd00d2391d39470a";

async function fetchNear(options: FetchOptions) {
    const dailyFees = options.createBalances();
    // fees accrue inside intents.near and are realized when withdrawn to reffer.near,
    // same realization basis as the near-intents adapter revenue wallets
    const query = `
        SELECT contract_account_id AS token, SUM(CAST(delta_amount AS DOUBLE)) AS amount
        FROM near.ft_transfers
        WHERE affected_account_id = '${APP_FEE_WALLET}'
          AND involved_account_id = 'intents.near'
          AND delta_amount > 0
          AND block_date = DATE '${options.dateString}'
        GROUP BY 1
    `;
    const rows = await queryDuneSql(options, query);
    for (const row of rows) {
        dailyFees.add(row.token, row.amount, "App Fees");
    }
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchEvm(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const { proxy, usdc } = CCTP_PROXY[options.chain];
    const logs = await options.getLogs({
        target: proxy,
        topic: CCTP_DEPOSIT_TOPIC,
        entireLog: true,
    });
    for (const log of logs) {
        const fee = BigInt("0x" + log.data.slice(2).slice(64 * 3, 64 * 4));
        dailyFees.add(usdc, fee, "CCTP Custom Fees");
    }
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const fetch = async (options: FetchOptions) => {
    return options.chain === CHAIN.NEAR ? fetchNear(options) : fetchEvm(options);
};

const methodology = {
    Fees: "Fees StableFlow charges its users: app fees on NEAR-Intents-routed transfers (1bps on routes touching BNB Chain/Tron, flat fee on Tron routes, LayerZero gas recovery on hybrid routes) plus the custom fee retained by StableFlow's CCTP wrapper contracts. Third-party fees (solver spread, NEAR Intents protocol fee, Circle's CCTP fee, LayerZero messaging fees) are excluded and tracked under their own listings.",
    Revenue: "All StableFlow fees are kept by the protocol.",
    ProtocolRevenue: "All StableFlow fees are kept by the protocol.",
};

const breakdownMethodology = {
    Fees: {
        "App Fees": "1Click appFees paid to reffer.near, realized when withdrawn from intents.near. Also part of the near-intents adapter's gross fees, where they are classified as supply-side (paid to distribution channels).",
        "CCTP Custom Fees": "Fee retained at deposit by StableFlow's depositForBurn wrapper contracts. Circle's fast-transfer fee is excluded (tracked under the cctp adapter).",
    },
};

const adapter: SimpleAdapter = {
    version: 1, // Dune
    fetch,
    chains: [CHAIN.NEAR, ...Object.keys(CCTP_PROXY)],
    start: "2025-10-10",
    dependencies: [Dependencies.DUNE],
    methodology,
    breakdownMethodology,
};

export default adapter;
