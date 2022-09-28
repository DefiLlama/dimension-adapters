import axios from 'axios'

export const getPrices = async (tokens: string[], timestamp?: number) => {
    let body: any = {
        "coins": Array.from(tokens),
    }
    if (timestamp) {
        body = {
            "timestamp": timestamp,
            ...body
        }
    }
    return (await axios.post("https://coins.llama.fi/prices", body)).data.coins as {
        [address:string]: { decimals: number, price: number, symbol: string, timestamp: number }
    }
}