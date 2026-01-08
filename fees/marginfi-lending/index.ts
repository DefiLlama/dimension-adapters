import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { httpPost } from "../../utils/fetchURL";
import { encodeBase58 } from "ethers";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const MARGINFI_PROGRAM = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";
const GLOBAL_FEE_WALLET = "CYXEgwbPHu2f9cY3mcUkinzDoDcsSan7myh1uBvYRbEw";
const BANK_DISCRIMINATOR = [142, 49, 166, 242, 50, 66, 97, 188];
const INSURANCE_VAULT_OFFSET = 146;
const FEE_VAULT_OFFSET = 200;

function extractPubkey(data: string, offset: number): string {
    const buffer = Buffer.from(data, 'base64');
    const pubkeyBytes = new Uint8Array(buffer.slice(offset, offset + 32));
    return encodeBase58(pubkeyBytes);
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = options.createBalances();
    // Get all Bank accounts from marginfi program
    const allAccountsResponse = await httpPost(SOLANA_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
            MARGINFI_PROGRAM,
            {
                encoding: "base64",
                dataSlice: {
                    offset: 0,
                    length: 300,
                },
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: encodeBase58(new Uint8Array(Buffer.from(BANK_DISCRIMINATOR))),
                        },
                    },
                ],
            },
        ],
    });

    // Get vaults from banks
    const allTargets: string[] = [GLOBAL_FEE_WALLET];
    for (const account of allAccountsResponse.result) {
        const data = account.account.data[0];
        const insuranceVault = extractPubkey(data, INSURANCE_VAULT_OFFSET);
        const feeVault = extractPubkey(data, FEE_VAULT_OFFSET);

        allTargets.push(insuranceVault);
        allTargets.push(feeVault);
    }

    const allFees = await getSolanaReceived({ options, targets: allTargets });
    dailyFees.addBalances(allFees);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            start: "2023-07-03"
        },
    },
    methodology: {
        Fees: 'Program fees collected by marginfi protocol.',
        Revenue: "All fees collected by the protocol including global fee wallet, bank fee vaults, and insurance vaults.",
        ProtocolRevenue: "All fees (global wallet + bank fee vaults + insurance vaults). Insurance funds are controlled by the protocol admin and can be used to cover bad debt.",
    },
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM]
};

export default adapter;
