export const convertChain = (chain: string) => ({
    gnosis: "xdai",
    avalanche: "avax"
}[chain] ?? chain)

export const convertChainToAllium = (chain: string) => ({
    xdai: "gnosis",
    avax: "avalanche",
    manta: "manta_pacific"
}[chain] ?? chain)

export const isAcceptedChain = (chain: string) => [
    "arbitrum", "avax", "ethereum", "optimism", "polygon", "tron", "base",
    "scroll", "polygon_zkevm", "bsc", "megaeth", "katana", "abstract", "linea",
    "manta", "ronin", "sonic", "mantle", "berachain", "blast", "monad",
    "plasma", "sei", "core", "tempo", "stable",
].includes(chain)
