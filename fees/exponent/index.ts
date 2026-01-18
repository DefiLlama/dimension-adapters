import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { httpPost } from "../../utils/fetchURL";
import { encodeBase58 } from "ethers";
import { getEnv } from "../../helpers/env";
import { getConfig } from "../../helpers/cache";
import { Balances } from "@defillama/sdk";

const MARKET_TREASURY_OFFSET = 264;
const VAULT_TREASURY_OFFSET = 473;

const METRIC = {
  MarketsSwapFees: 'Markets Swap Fees',
  MarketsSwapFeesToLPs: 'Markets Swap Fees To LPs',
  MarketsSwapFeesToProtocol: 'Markets Swap Fees To Protocol',
  VaultManagementFees: 'Vaults Vault Management Fees',
}

// convert base64 to bytes and extract pubkey
function extractPubkey(base64Data: string, offset: number): string {
    const buffer = Buffer.from(base64Data, 'base64');
    const pubkeyBytes = new Uint8Array(buffer.slice(offset, offset + 32));
    return encodeBase58(pubkeyBytes);
}

interface SyTokenInfo {
    underlying: string;
    exchangeRate: number;
}

// Build mapping from SY tokens to underlying tokens and exchange rates
function buildSyTokenMappings(markets: any[], vaults: any[]): Map<string, SyTokenInfo> {
    const mappings = new Map<string, SyTokenInfo>();

    for (const vault of vaults) {
        if (vault.mintSy && vault.mintAsset && vault.lastSeenSyExchangeRate) {
            mappings.set(vault.mintSy, {
                underlying: vault.mintAsset,
                exchangeRate: vault.lastSeenSyExchangeRate,
            });
        }
    }

    for (const market of markets) {
        if (market.vault?.mintSy && market.vault?.mintAsset && market.vault?.lastSeenSyExchangeRate) {
            mappings.set(market.vault.mintSy, {
                underlying: market.vault.mintAsset,
                exchangeRate: market.vault.lastSeenSyExchangeRate,
            });
        }
    }

    return mappings;
}

// Convert SY tokens in balances to their underlying tokens (using raw amounts from getSolanaReceived())
// SY tokens (Exponent wrapped yield tokens) don't have prices, so we convert to underlying tokens.
function unwrapSyTokensInBalances(balances: Balances, syMappings: Map<string, SyTokenInfo>): void {
    const rawBalances = balances.getBalances();

    for (const [tokenKey, amount] of Object.entries(rawBalances)) {
        // Remove "solana:" prefix and get info from mapping
        const token = tokenKey.replace('solana:', '');
        const syInfo = syMappings.get(token);

        if (syInfo) {
            // Remove the SY token balance
            balances.removeTokenBalance(tokenKey);
            // Add the underlying token with amount adjusted by exchange rate
            const underlyingAmount = Number(amount) * syInfo.exchangeRate;
            balances.add(syInfo.underlying, underlyingAmount);
        }
    }
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // Get markets and vaults
    const marketsResponse = await getConfig('exponent/markets', 'https://web-api.exponent.finance/api/markets');
    const vaultsResponse = await getConfig('exponent/vaults', 'https://web-api.exponent.finance/api/vaults');

    // Build mapping from SY token mints to underlying assets for unwrapping
    const syMappings = buildSyTokenMappings(marketsResponse.data, vaultsResponse.data);

    // Get market treasury accounts
    const marketIds = marketsResponse.data.map((m: any) => m.id);
    const marketResponse = await httpPost(getEnv("SOLANA_RPC"), {
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [marketIds, { encoding: "base64" }]
    });
    const marketTreasuryAccounts: string[] = [];
    for (let i = 0; i < marketResponse.result.value.length; i++) {
        const account = marketResponse.result.value[i];
        if (!account) continue;
        const treasury = extractPubkey(account.data[0], MARKET_TREASURY_OFFSET);
        marketTreasuryAccounts.push(treasury);
    }

    // get vault treasury accounts
    const vaultIds = vaultsResponse.data.map((v: any) => v.id);
    const rpcResponse = await httpPost(getEnv("SOLANA_RPC"), {
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [vaultIds, { encoding: "base64" }]
    });
    const vaultTreasuryAccounts: string[] = [];
    for (let i = 0; i < rpcResponse.result.value.length; i++) {
        const account = rpcResponse.result.value[i];
        if (!account) continue;
        const treasury = extractPubkey(account.data[0], VAULT_TREASURY_OFFSET);
        vaultTreasuryAccounts.push(treasury);
    }

    // Market trading fees (35% protocol, 65% LP)
    const dailyMarketFees = await getSolanaReceived({ options, targets: marketTreasuryAccounts });
    unwrapSyTokensInBalances(dailyMarketFees, syMappings);
    dailyFees.addBalances(dailyMarketFees, METRIC.MarketsSwapFees);
    dailyRevenue.addBalances(dailyMarketFees.clone(0.35), METRIC.MarketsSwapFeesToProtocol);
    dailySupplySideRevenue.addBalances(dailyMarketFees.clone(0.65), METRIC.MarketsSwapFeesToLPs);

    // Vault yield fees (5.5% of yield)
    const dailyVaultFees = await getSolanaReceived({ options, targets: vaultTreasuryAccounts });
    unwrapSyTokensInBalances(dailyVaultFees, syMappings);
    dailyFees.addBalances(dailyVaultFees, METRIC.VaultManagementFees);
    dailyRevenue.addBalances(dailyVaultFees, METRIC.VaultManagementFees);

    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    fetch,
    start: "2025-02-03",
    chains: [CHAIN.SOLANA],
    methodology: {
        Fees: "Trading fees from AMM swaps and 5.5% performance fee on vault yields.",
        Revenue: "5.5% performance fee on vault yields and 35% of AMM trading fees.",
        ProtocolRevenue: "5.5% performance fee on vault yields and 35% of AMM trading fees.",
        SupplySideRevenue: "65% of AMM trading fees distributed to liquidity providers.",
    },
    breakdownMethodology: {
        Fees: {
          [METRIC.MarketsSwapFees]: 'Trading fees from AMM markets.',
          [METRIC.VaultManagementFees]: '5.5% performance fee on vaults yields.',
        },
        Revenue: {
          [METRIC.MarketsSwapFeesToProtocol]: '35% of trading fees from AMM markets collected by protocol.',
          [METRIC.VaultManagementFees]: '5.5% performance fee on vaults yields collected by protocol.',
        },
        ProtocolRevenue: {
          [METRIC.MarketsSwapFeesToProtocol]: '35% of trading fees from AMM markets collected by protocol.',
          [METRIC.VaultManagementFees]: '5.5% performance fee on vaults yields collected by protocol.',
        },
        SupplySideRevenue: {
          [METRIC.MarketsSwapFeesToLPs]: '65% of trading fees from AMM markets are distributed to LPs.',
        },
    },
    dependencies: [Dependencies.ALLIUM]
};

export default adapter;