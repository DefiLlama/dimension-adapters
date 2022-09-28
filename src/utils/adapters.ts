import feeAdaptors from "../adapters";
import { FeeAdapter } from "./adapters.type";
import data from "./protocols/data";
import chains from "./protocols/chains";
import { Chain } from "./constants";
import { Protocol, ChainObject } from "./protocols/types";
import { sluggifyString } from "./sluggify";
import { IConfig } from "./config";


export interface IAdapterInfo {
  id: string
  chain: string
  timestamp: number
  version?: string
}

export async function handleAdapterError(e: Error, adapterInfo?: IAdapterInfo) {
  // TODO: handle error properly
  console.error(adapterInfo)
  console.error(e)
  throw new Error(`Couldn´t get data for ${JSON.stringify(adapterInfo)}`)
}

export interface Adaptor {
    id: string;
    name: string;
    adapterKey: string;
    adapterType: string;
}

export function notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
}

const filterIndexProtocol = (protocol: Protocol, adapterKey: string) =>
    protocol.name.toLowerCase()?.includes(adapterKey)
    || protocol.gecko_id?.includes(adapterKey)
    || protocol.module.split("/")[0]?.includes(adapterKey)
    || sluggifyString(protocol.name) === adapterKey;

const filterIndexChain = (chain: ChainObject, adapterKey: string) =>
    chain.name.toLowerCase().includes(adapterKey);

const getProtocolIndex = (isNotChain: boolean, adapterKey: string, config: IConfig): (Protocol | ChainObject | undefined) => {
    const chain = Object.keys(config.chainCoingeckoIds).map((name: string) => {
        return {
            ...config.chainCoingeckoIds[name],
            name: name.toLowerCase()
        }
    });
    return isNotChain ? config.protocols.find((prot: Protocol) => filterIndexProtocol(prot, adapterKey))
        : chain.find((chain: ChainObject) => filterIndexChain(chain , adapterKey));
}

const allFeeAdapters: Record<string, FeeAdapter> = feeAdaptors;

export const protocolFeeAdapters = (config: IConfig): FeeAdapter[] => {
    return Object.entries(allFeeAdapters).map(adapterObj => {
        const [adapterKey, adapter] = adapterObj
        const adapterType = adapter.adapterType

        const isNotChain = adapterType === undefined;
        const foundInProtocols = getProtocolIndex(isNotChain, adapterKey, config);

        if (foundInProtocols) {
            return allFeeAdapters[adapterKey]
        }
        // TODO: Handle better errors
        console.error(`Missing info for ${adapterKey}!`)
        return undefined
    }).filter(notUndefined);
}

export const protocolAdapterData = (config: IConfig) => {
    return Object.entries(allFeeAdapters).map(adapterObj => {
        const [adapterKey, adapter] = adapterObj
        const adapterType = adapter.adapterType

        if (!adapterType) {
            const isNotChain = true;
            const foundInProtocols = getProtocolIndex(isNotChain, adapterKey, config) as Protocol;
            if (foundInProtocols) {
                return {
                    ...foundInProtocols,
                    adapterType: "protocol",
                    adapterKey
                }
            }
        } else if (adapterType === "chain") {
            const isNotChain = false;
            const foundInChains = getProtocolIndex(isNotChain, adapterKey, config) as ChainObject;
            if (foundInChains)  {
                return {
                    id: foundInChains.chainId ? foundInChains.chainId.toString() : foundInChains.tokenSymbol?.toLowerCase() || foundInChains.name.toLowerCase(),
                    name: foundInChains.name,
                    category: "Chain",
                    symbol: foundInChains.tokenSymbol,
                    gecko_id: foundInChains.gecko_id,
                    cmcId: foundInChains.cmcId,
                    adapterType,
                    adapterKey
                }
            }
        }
        // TODO: Handle better errors
        console.error(`Missing info for ${adapterKey}!`)
        return undefined
    }).filter(notUndefined);
}

export const getAllChainsFromAdapters = (_: IConfig) => {
    return Object.values(protocolFeeAdapters).reduce((acc, adapter) => {
        if ("fees" in adapter) {
            const chains = Object.keys(adapter.fees) as Chain[]
            for (const chain of chains)
                if (!acc.includes(chain)) acc.push(chain)
        } else if ("breakdown" in adapter) {
            for (const brokenDownDex of Object.values(adapter.breakdown)) {
                const chains = Object.keys(brokenDownDex as Chain) as Chain[]
                for (const chain of chains)
                    if (!acc.includes(chain)) acc.push(chain)
            }
        } else console.error("Invalid adapter")
        return acc
    }, [] as Chain[])
}
