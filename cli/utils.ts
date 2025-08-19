import { getLatestBlock } from "@defillama/sdk/build/util";
import { SimpleAdapter, whitelistedDimensionKeys, } from "../adapters/types";
import { humanizeNumber } from "@defillama/sdk/build/computeTVL/humanizeNumber";

import * as sdk from "@defillama/sdk" 

export const ERROR_STRING = '------ ERROR ------'

export function checkArguments(argv: string[]) {
    if (argv.length < 4) {
        console.error(`Missing arguments, you need to provide the folder name of the adapter to test.
    Eg: yarn test volume uniswap`);
        process.exit(1);
    }
}

export async function getLatestBlockRetry(chain: string) {
    for (let i = 0; i < 5; i++) {
        try {
            return await getLatestBlock(chain);
        } catch (e) {
            throw new Error(`Couln't get block heights for chain "${chain}"\n${e}`);
        }
    }
}

export function printVolumes(volumes: any[], _?: SimpleAdapter) {
    const exclude2Print = ['startTimestamp', 'chain']
    let keys = volumes.map((element) => Object.keys(element)).flat()
    keys.forEach((key) => {
        if (!whitelistedDimensionKeys.has(key))
            throw new Error(`"${key}" is not a supported metric.Supported metrics can be found in adapters/types.ts`)
    })
    volumes.forEach((element) => {
        // const methodology =  module?.methodology
        if (typeof element.chain === 'string')
            console.info(element.chain.toUpperCase(), "👇")
        if (element.startTimestamp !== undefined && element.startTimestamp !== 0)
            console.info(`Backfill start time: ${formatTimestampAsDate(String(element.startTimestamp))}`)
        // else console.info("Backfill start time not defined")
        // if (typeof methodology === 'string') console.log("Methodology:", methodology)
        // else if (!methodology) console.log("NO METHODOLOGY SPECIFIED")
        Object.entries(element).forEach(([attribute, value]) => {
            if (attribute === 'timestamp' && !value) return;
            if (!exclude2Print.includes(attribute)) {
                const valueFormatted = typeof value === 'object' ? JSON.stringify(value, null, 2) : attribute === "timestamp" ? value + ` (${new Date((value as any) * 1e3).toISOString()})` : humanizeNumber(Number(value))
                console.info(`${camelCaseToSpaces(attribute === "timestamp" ? "endTimestamp" : attribute)}: ${valueFormatted}`)
                // if (valueFormatted !== undefined && typeof methodology === 'object' && methodology[attribute.slice(5)])
                //     console.log("└─ Methodology:", methodology?.[attribute.slice(5)])
            }
        })
        console.info('\n')
    });


    if (volumes.length > 1) {
        const aggregated: {
            [key: string]: any
        } = {
            chain: '---- aggregate',
            timestamp: volumes[0].timestamp,
        }
        const ignoredKeySet = new Set(['chain', 'timestamp', 'startTimestamp'])
        volumes.forEach((element) => {
            for (const [key, value] of Object.entries(element)) {
                if (!ignoredKeySet.has(key)) {
                    if (aggregated[key] === undefined) aggregated[key] = 0
                    aggregated[key] += value
                }
            }
        })
        printVolumes([aggregated])
    }
}

export function printVolumes2(volumes: any[]) {
    if (volumes?.length < 2) return printVolumes(volumes);

    const exclude2Print = ['startTimestamp', 'chain', 'timestamp', 'block']
    const printTable: any = {}
    let keys = volumes.map((element) => Object.keys(element)).flat()
    keys.forEach((key) => {
        if (!whitelistedDimensionKeys.has(key))
            throw new Error(`"${key}" is not a supported metric.Supported metrics can be found in adapters/types.ts`)
    })
    volumes.forEach((element) => {
        const item: any = {}
        Object.entries(element).forEach(([attribute, value]) => {
            if (attribute === 'timestamp' && !value) return;
            if (!exclude2Print.includes(attribute)) {
                const valueFormatted = typeof value === 'object' ? JSON.stringify(value, null, 2) : attribute === "timestamp" ? value + ` (${new Date((value as any) * 1e3).toISOString()})` : humanizeNumber(Number(value))
                item[getLabel(attribute)] = valueFormatted
            }
        })
        if (element.startTimestamp !== undefined && element.startTimestamp !== 0)
            item['Start Time'] = formatTimestampAsDate(String(element.startTimestamp))
        printTable[element.chain] = item
    });


    if (volumes.length > 1) {
        const aggregated: any = {}
        const aggData: any = {}
        const ignoredKeySet = new Set(exclude2Print)
        volumes.forEach((element) => {
            for (const [key, value] of Object.entries(element)) {
                if (!ignoredKeySet.has(key)) {
                    if (aggData[key] === undefined) aggData[key] = 0
                    aggData[key] += value
                }
            }
        })
        Object.entries(aggData).forEach(([key, value]) => {
            aggregated[getLabel(key)] = typeof value === 'object' ? JSON.stringify(value, null, 2) : humanizeNumber(Number(value))
        })
        printTable['Aggregate'] = aggregated
    }

    // console.table(printTable)
    const entries = Object.entries(printTable).map(([key, value]: any) => ({ chain: key, ...value }));

    console.log(sdk.util.tableToString(entries))
    

    function getLabel(key: string) {
        return camelCaseToSpaces(key === "timestamp" ? "endTimestamp" : key)
    }
}

export function formatTimestampAsDate(timestamp: string) {
    const date = new Date(Number(timestamp) * 1000);
    return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
}

export function upperCaseFirst(t: string) {
    return t[0].toUpperCase() + t.slice(1)
}

export function camelCaseToSpaces(s: string) {
    const withSpaces = s// insert a space before all caps
        .replace(/([A-Z])/g, ' $1')
        // uppercase the first character
        .replace(/^./, function (str) { return str.toUpperCase(); })
    return withSpaces[0] + withSpaces.slice(1).toLowerCase()
}

// move timestamp attr to the end of given object
const timestampKey = 'timestamp'
export function timestampLast(item: any): any {
    const newItem: any = {}

    // iterate over all keys in the original object
    for (const key in item) {
        if (key !== timestampKey) {
            // Add keys that are not the one to move to the new object first
            newItem[key] = item[key];
        }
    }

    // Add the key to move at the end
    if (item.hasOwnProperty(timestampKey)) {
        newItem[timestampKey] = item[timestampKey];
    }

    return newItem
}
