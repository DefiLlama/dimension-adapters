import { getLatestBlock } from "@defillama/sdk/build/util";
import { IRunAdapterResponseFulfilled, IRunAdapterResponseRejected } from "../adapters/utils/runAdapter";

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

const exclude2Print = ['startTimestamp', 'chain']
export function printVolumes(volumes: IRunAdapterResponseFulfilled[]) {
    volumes.forEach((element) => {
        if (typeof element.chain === 'string')
            console.info(element.chain.toUpperCase(), "👇")
        if (element.startTimestamp !== undefined)
            console.info(`Backfill start time: ${formatTimestampAsDate(String(element.startTimestamp))}`)
        else console.info("Backfill start time not defined")
        Object.entries(element).forEach(([attribute, value]) => {
            if (!exclude2Print.includes(attribute))
                console.info(`${camelCaseToSpaces(attribute)}: ${value}`)
        })
        console.info('\n')
    });
}

export function printRejectedVolumes(volumes: IRunAdapterResponseRejected[]) {
    volumes.forEach((element) => {
        if (typeof element.chain === 'string')
            console.info(element.chain.toUpperCase(), "👇")
        if (element.timestamp !== undefined)
            console.info(`Timestamp attempted: ${formatTimestampAsDate(String(element.timestamp))}`)
        else console.info("No timestamp defined")
        console.info(element.error)
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