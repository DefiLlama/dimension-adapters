import fetchURL from "../../utils/fetchURL";

// These utils were adapted from the DefiLlama-Adapters repo
export type Chain = "osmosis" | "injective" | "sei"

const endpoints:Record<Chain,string> = {
    osmosis: "https://osmosis-api.polkachu.com",
    injective: "https://lcd-injective.whispernode.com:443",
    sei: "https://sei-api.polkachu.com",
};

export async function queryContract<T>({contract, chain, msg}:{contract: string, chain: Chain, msg: T}) {
    const data = Buffer.from(JSON.stringify(msg)).toString("base64");

    const endpoint = endpoints[chain]
    return (
      await fetchURL(
        `${endpoint}/cosmwasm/wasm/v1/contract/${contract}/smart/${data}`
      )
    ).data.data;
}