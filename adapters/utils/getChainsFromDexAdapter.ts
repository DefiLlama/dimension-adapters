import { Chain } from "../../adapters/types"
import { Adapter, DISABLED_ADAPTER_KEY } from "../types"

export default (dexAdapter: Adapter, filter: boolean = true) => {
    const acc = [] as Chain[]
    if ("adapter" in dexAdapter) {
        const chains = (Object.keys(dexAdapter.adapter)).filter(c => !filter || c !== DISABLED_ADAPTER_KEY) as Chain[]
        for (const chain of chains)
            if (!acc.includes(chain)) acc.push(chain)
    } else if ("breakdown" in dexAdapter) {
        for (const brokenDownDex of Object.values(dexAdapter.breakdown)) {
            const chains = Object.keys(brokenDownDex).filter(c => c !== DISABLED_ADAPTER_KEY) as Chain[]
            for (const chain of chains)
                if (!acc.includes(chain)) acc.push(chain)
        }
    } else console.error("Invalid adapter")
    return acc
}