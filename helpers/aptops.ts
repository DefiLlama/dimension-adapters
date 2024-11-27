import {httpGet, httpPost} from "../utils/fetchURL";

export const APTOS_PRC = 'https://aptos-mainnet.pontem.network';

const getResources = async (account: string): Promise<any[]> => {
    const data: any = []
    let lastData: any;
    let cursor
    do {
        let url = `${APTOS_PRC}/v1/accounts/${account}/resources?limit=9999`
        if (cursor) url += '&start=' + cursor
        const res = await httpGet(url, undefined, {withMetadata: true})
        lastData = res.data
        data.push(...lastData)
        cursor = res.headers['x-aptos-cursor']
    } while (lastData.length === 9999)
    return data
}

async function view<T extends any[]>(functionStr: string, type_arguments: string[] = [], args: (string | boolean | number)[] = [], ledgerVersion?: bigint | number): Promise<T> {
    let path = `https://fullnode.mainnet.aptoslabs.com/v1/view`
    if (ledgerVersion !== undefined) path += `?ledger_version=${ledgerVersion.toString()}`
    return (await httpPost(path, {"function": functionStr, "type_arguments": type_arguments, arguments: args})) as T
}

export {
    getResources,
    view
}
