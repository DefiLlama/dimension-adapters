import * as sdk from "@defillama/sdk";

type GetLogsParams = {
    target: string;
    topic: string;
    keys: string[];
    fromBlock: number;
    toBlock: number;
    topics?: string[] | undefined;
    chain?: sdk.api2.config.Chain | undefined;
}

const getLogs = async (params: GetLogsParams, splitInto: number = 100) => {
    if (params.toBlock - params.fromBlock < splitInto) return sdk.api.util.getLogs(params)
    const step = Math.ceil((params.toBlock - params.fromBlock) / splitInto)
    const output = await Promise.all([...Array(splitInto)].map((_, i) => {
        return sdk.api.util.getLogs({
            ...params,
            fromBlock: params.fromBlock + (step * i),
            toBlock: Math.min(params.toBlock, params.fromBlock + (step * (i + 1)))
        })
    })).then(resultArrs => resultArrs.map(res => {
        return res.output
    }).flat())
    return { output }
}

export function notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
}

export default getLogs