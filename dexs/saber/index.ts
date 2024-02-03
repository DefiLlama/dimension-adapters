import axios from "axios"
import { getPrices } from "../../utils/prices";

async function last24h(timestamp: number) {
    const data = await axios.post('https://saberqltest.aleph.cloud/', { "query": "{\n  pools {\n    ammId\n    name\n    coin {\n      chainId\n      address\n      name\n      decimals\n      symbol\n      logoURI\n    }\n    pc {\n      chainId\n      address\n      name\n      decimals\n      symbol\n      logoURI\n    }\n    lp {\n      chainId\n      address\n      name\n      decimals\n      symbol\n      logoURI\n    }\n    stats {\n      tvl_pc\n      tvl_coin\n      price\n      vol24h\n    }\n  }\n}\n" })
    const coinId = "solana:So11111111111111111111111111111111111111112";
    const prices = await getPrices([coinId], timestamp)
    const vol = data.data.data.pools.reduce(
        (a: number, b: any) =>
            a + b.stats.vol24h *
            (b.pc.address === "So11111111111111111111111111111111111111112" ? prices[coinId].price : 1)
        , 0)
    return {
        dailyVolume: vol,
        timestamp: Date.now() / 1e3
    }
}

export default {
    adapter: {
        "solana": {
            fetch: last24h,
            runAtCurrTime: true,
            start: 0,
        }
    }
}
