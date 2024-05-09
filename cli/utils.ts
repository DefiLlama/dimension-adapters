import { getLatestBlock } from "@defillama/sdk/build/util";
import { BaseAdapter, } from "../adapters/types";
import { humanizeNumber } from "@defillama/sdk/build/computeTVL/humanizeNumber";

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

export function printVolumes(volumes: any[], baseAdapter?: BaseAdapter) {
    const exclude2Print = ['startTimestamp', 'chain']
    volumes.forEach((element) => {
        const methodology = baseAdapter?.[element.chain].meta?.methodology
        if (typeof element.chain === 'string')
            console.info(element.chain.toUpperCase(), "👇")
        if (element.startTimestamp !== undefined && element.startTimestamp !== 0)
            console.info(`Backfill start time: ${formatTimestampAsDate(String(element.startTimestamp))}`)
        else console.info("Backfill start time not defined")
        if (typeof methodology === 'string') console.log("Methodology:", methodology)
        else if (!methodology) console.log("NO METHODOLOGY SPECIFIED")
        Object.entries(element).forEach(([attribute, value]) => {
            if (!exclude2Print.includes(attribute)) {
                const valueFormatted = typeof value === 'object' ? JSON.stringify(value, null, 2) : attribute === "timestamp" ? value + ` (${new Date((value as any)  * 1e3).toISOString()})` : humanizeNumber(Number(value))
                    console.info(`${camelCaseToSpaces(attribute)}: ${valueFormatted}`)
                if (valueFormatted !== undefined && typeof methodology === 'object' && methodology[attribute.slice(5)])
                    console.log("└─ Methodology:", methodology?.[attribute.slice(5)])
            }
        })
        console.info('\n')
    });
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