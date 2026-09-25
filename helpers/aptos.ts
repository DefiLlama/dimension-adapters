// Aptos helpers on top of `sdk.chains.aptos`. Every call honours `APTOS_RPC` (comma separated
// fallbacks), retries transient failures and falls back to the archival node when the primary
// answers 410 (pruned). Timestamp -> version lookups are a REST binary search over block heights
// instead of the aptoslabs indexer GraphQL API.
import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints (APTOS_RPC, ...) into process.env for the sdk

const aptos = sdk.chains.aptos

export const APTOS_RPC = aptos.getEndpoint()

// Takes an amount in Octas as input and returns the same amount in APT.
const octasToApt = (octas: number | bigint) => aptos.octasToApt(octas)

// Given a timestamp, returns the last transaction version at or before it.
const getVersionFromTimestamp = async (timestamp: Date, minBlock = 0): Promise<number> => {
    return aptos.getVersionAtTimestamp({ timestamp: Math.floor(timestamp.getTime() / 1000), minBlock })
}

// Every resource of `account` (`{ type, data }[]`), following `x-aptos-cursor` pagination.
const getResources = async (account: string, ledgerVersion?: number | string): Promise<any[]> => {
    return aptos.getResources({ account, ledgerVersion })
}

async function view<T extends any[]>(functionStr: string, type_arguments: string[] = [], args: (string | boolean | number)[] = [], ledgerVersion?: bigint | number): Promise<T> {
    return aptos.view<T>({ function: functionStr, typeArguments: type_arguments, args, ledgerVersion: ledgerVersion === undefined ? undefined : ledgerVersion.toString() })
}

// return raw supply (in base units) and decimals of the given coin type
async function getCoinSupply(coin: string): Promise<{
    decimals: number;
    supply: number;
}> {
    // getCoinSupply resolves the full supply (legacy CoinInfo + paired fungible asset); the
    // CoinInfo.supply field alone undercounts coins that migrated to the FA standard (e.g. USDY)
    const [info, supply] = await Promise.all([
        aptos.getCoinInfo({ coinType: coin }),
        aptos.getCoinSupply({ coinType: coin }),
    ])
    return {
        decimals: info.decimals,
        supply: Number(supply),
    }
}

export {
    getResources,
    getVersionFromTimestamp,
    octasToApt,
    view,
    getCoinSupply,
}
