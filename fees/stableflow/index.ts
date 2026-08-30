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

// fee PDA of their solana CCTP proxy program 8whUZNSbjJXC2UDRpo3PXo5MHzhptwVTTwpSYuTgQJNY -
// receives the retained fee on every deposit (only fees flow to it)
const SOLANA_FEE_OWNER = "coNkR1719kohnaxQrVPwvaGdVrqPTps6NFUZic3hGJb";

// fees are paid in intents.near multi-token ids wrapping assets from other chains;
// map them to their underlying token so the price server can resolve them
const OMFT_CHAINS: Record<string, string> = { eth: "ethereum", arb: "arbitrum", base: "base", op: "optimism", gnosis: "xdai" };
const HOT_CHAINS: Record<string, string> = { "56": "bsc", "137": "polygon" }; // omni.hot.tg chain ids
// non-EVM omft ids are opaque hashes, mapped by observed metadata
const FIXED_TOKENS: Record<string, { cgId: string; decimals: number }> = {
    "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near": { cgId: "tether", decimals: 6 },
    "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near": { cgId: "usd-coin", decimals: 6 },
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base58ToAddress = (s: string) => "0x" + [...s].reduce((n, c) => n * 58n + BigInt(B58.indexOf(c)), 0n).toString(16).padStart(40, "0");

// nep141:usdt.tether-token.near -> near:usdt.tether-token.near
// nep141:eth-0xdac1....omft.near -> ethereum:0xdac1...
// nep245:v2_1.omni.hot.tg:56_<base58 of address> -> bsc:0x...
function toLlamaToken(id: string): string | undefined {
    if (id.startsWith("nep141:")) {
        const token = id.slice(7);
        if (!token.endsWith(".omft.near")) return `near:${token}`;
        const [prefix, address] = token.replace(".omft.near", "").split("-");
        if (OMFT_CHAINS[prefix]) return `${OMFT_CHAINS[prefix]}:${address}`;
    }
    if (id.startsWith("nep245:v2_1.omni.hot.tg:")) {
        const [chainId, encoded] = id.slice(24).split("_");
        if (HOT_CHAINS[chainId]) return `${HOT_CHAINS[chainId]}:${base58ToAddress(encoded)}`;
    }
    return undefined;
}

async function fetchNear(options: FetchOptions) {
    const dailyFees = options.createBalances();
    // app fees are credited to reffer.near inside intents.near at settlement,
    // emitted as NEP-245 mt_transfer events in the contract logs
    const query = `
        WITH events AS (
            SELECT json_parse(substr(log, 12)) AS ev
            FROM near.logs
            WHERE executor_account_id = 'intents.near'
              AND log LIKE 'EVENT_JSON:%'
              AND log LIKE '%${APP_FEE_WALLET}%'
              AND block_date = DATE '${options.dateString}'
              AND json_extract_scalar(json_parse(substr(log, 12)), '$.event') = 'mt_transfer'
        ),
        transfers AS (
            SELECT
                json_extract_scalar(d, '$.new_owner_id') AS recipient,
                CAST(json_extract(d, '$.token_ids') AS array(varchar)) AS token_ids,
                CAST(json_extract(d, '$.amounts')   AS array(varchar)) AS amounts
            FROM events
            CROSS JOIN UNNEST(CAST(json_extract(ev, '$.data') AS array(json))) AS t(d)
        )
        SELECT tok AS token, SUM(CAST(amt AS DOUBLE)) AS amount
        FROM transfers
        CROSS JOIN UNNEST(token_ids, amounts) AS z(tok, amt)
        WHERE recipient = '${APP_FEE_WALLET}'
        GROUP BY 1
    `;
    const rows = await queryDuneSql(options, query);
    for (const row of rows) {
        const fixed = FIXED_TOKENS[row.token];
        if (fixed) {
            dailyFees.addCGToken(fixed.cgId, Number(row.amount) / 10 ** fixed.decimals, "App Fees");
            continue;
        }
        const token = toLlamaToken(row.token);
        if (!token) throw new Error(`stableflow: unmapped fee token ${row.token}`);
        dailyFees.add(token, row.amount, "App Fees", { skipChain: true });
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

async function fetchSolana(options: FetchOptions) {
    const dailyFees = options.createBalances();
    // deposits flow through the fee PDA's token account (deposit in, burn out, fee stays),
    // so the retained fee is the per-transaction net inflow
    const query = `
        WITH per_tx AS (
            SELECT tx_id, token_mint_address AS mint,
                SUM(CASE WHEN to_owner = '${SOLANA_FEE_OWNER}' THEN CAST(amount AS DOUBLE) ELSE -CAST(amount AS DOUBLE) END) AS net
            FROM tokens_solana.transfers
            WHERE (to_owner = '${SOLANA_FEE_OWNER}' OR from_owner = '${SOLANA_FEE_OWNER}')
              AND TIME_RANGE
            GROUP BY 1, 2
        )
        SELECT mint, SUM(net) AS amount FROM per_tx WHERE net > 0 GROUP BY 1
    `;
    const rows = await queryDuneSql(options, query);
    for (const row of rows) {
        dailyFees.add(row.mint, row.amount, "CCTP Custom Fees");
    }
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const fetch = async (options: FetchOptions) => {
    if (options.chain === CHAIN.NEAR) return fetchNear(options);
    if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
    return fetchEvm(options);
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
    chains: [CHAIN.NEAR, CHAIN.SOLANA, ...Object.keys(CCTP_PROXY)],
    start: "2025-10-10",
    dependencies: [Dependencies.DUNE],
    methodology,
    breakdownMethodology,
};

export default adapter;
