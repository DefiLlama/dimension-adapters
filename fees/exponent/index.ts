import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import fetchURL, { httpPost } from "../../utils/fetchURL";
import { encodeBase58 } from "ethers";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const MARKET_TREASURY_OFFSET = 264;
const VAULT_TREASURY_OFFSET = 473;

// convert base64 to bytes and extract pubkey
function extractPubkey(base64Data: string, offset: number): string {
    const buffer = Buffer.from(base64Data, 'base64');
    const pubkeyBytes = new Uint8Array(buffer.slice(offset, offset + 32));
    return encodeBase58(pubkeyBytes);
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // get markets and vaults
    const marketsUrl = "https://web-api.exponent.finance/api/markets";
    const marketsResponse = await fetchURL(marketsUrl);
    const vaultsUrl = "https://web-api.exponent.finance/api/vaults";
    const vaultsResponse = await fetchURL(vaultsUrl);

    // get market treasury accounts
    const marketIds = marketsResponse.data.map((m: any) => m.id);
    const marketResponse = await httpPost(SOLANA_RPC, {
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
    const rpcResponse = await httpPost(SOLANA_RPC, {
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
    dailyFees.addBalances(dailyMarketFees);
    dailyRevenue.addBalances(dailyMarketFees.clone(0.35));
    dailySupplySideRevenue.addBalances(dailyMarketFees.clone(0.65));

    // Vault yield fees (5.5% of yield)
    const dailyVaultFees = await getSolanaReceived({ options, targets: vaultTreasuryAccounts });
    dailyFees.addBalances(dailyVaultFees);
    dailyRevenue.addBalances(dailyVaultFees);

    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: "2025-02-03",
        }
    },
    methodology: {
        Fees: "Trading fees from AMM swaps and 5.5% performance fee on vault yields.",
        Revenue: "5.5% performance fee on vault yields and 35% of AMM trading fees.",
        SupplySideRevenue: "65% of AMM trading fees distributed to liquidity providers.",
    },
    dependencies: [Dependencies.ALLIUM]
};

export default adapter;