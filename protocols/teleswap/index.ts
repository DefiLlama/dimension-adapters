import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
	dailyVolume: "Sum of wrap and unwrap for all tokens on the specified chain for the given day",
}

// Token configurations
const tokens = [
    // Rune tokens
    {
        type: "rune",
        chain: CHAIN.POLYGON,
        name: "dog-go-to-the-moon-rune",
        address: "0x6e031a95e251e0015eb99a330dc1d9933995cc33",
        decimals: 5,
    },
    {
        type: "rune",
        chain: CHAIN.POLYGON,
        name: "rune-pups",
        address: "0x588204367BCc4AC0C2b18A053035F19188Ccf7a6",
        decimals: 18,
    },
    // BRC-20 tokens
    {
        type: "brc20",
        chain: CHAIN.BSC,
        name: "ordi",
        address: "0x31cb552b371ffC38A67d0534Cb2eDDe3CaB42747",
        decimals: 18,
    },
	// TeleBTC tokens
    {
        type: "telebtc",
        chain: CHAIN.POLYGON,
        name: "bitcoin",
        address: "0x3BF668Fe1ec79a84cA8481CEAD5dbb30d61cC685",
        decimals: 8,
    },
    {
        type: "telebtc",
        chain: CHAIN.BSC,
        name: "bitcoin",
        address: "0xC58C1117DA964aEbe91fEF88f6f5703e79bdA574",
        decimals: 8,
    },
    {
        type: "telebtc",
        chain: CHAIN.BSQUARED,
        name: "bitcoin",
        address: "0x05698eaD40cD0941e6E5B04cDbd56CB470Db762A",
        decimals: 8,
    },
    {
        type: "telebtc",
        chain: CHAIN.BOB,
        name: "bitcoin",
        address: "0x0670bEeDC28E9bF0748cB254ABd946c87f033D9d",
        decimals: 8,
    },
];

const mintAbi =
    "event Mint(address indexed doer, address indexed receiver, uint value)";
const burnAbi =
    "event Burn(address indexed doer, address indexed burner, uint value)";

// Process logs for a token
const processLogs = async (
    logs: any[],
    dailyVolume: any,
    token: { name: string; decimals: number },
) => {
    for (const log of logs) {
        const tokenAmount = BigInt(log.data || 0);
        dailyVolume.addCGToken(
            token.name,
            Number(tokenAmount) / 10 ** token.decimals
        );
    }
};

const fetch = async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, getLogs, chain }: FetchOptions
) => {
    const dailyVolume = createBalances();

    for (const token of tokens) {
        if (token.chain !== chain) continue; // Skip if the token is not on the current chain

        const mintLogs = await getLogs({
            target: token.address,
            eventAbi: mintAbi,
            entireLog: true,
        });

        const burnLogs = await getLogs({
            target: token.address,
            eventAbi: burnAbi,
            entireLog: true,
        });

        // Process mint and burn logs
        await processLogs(mintLogs, dailyVolume, token);
        await processLogs(burnLogs, dailyVolume, token);
    }

    console.log(dailyVolume);

    return { timestamp, dailyVolume };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.POLYGON]: {
            fetch,
            start: "2023-11-26",
			meta: {
				methodology
			}
        },
        [CHAIN.BSC]: {
            fetch,
            start: "2023-12-03",
			meta: {
				methodology
			}
        },
        [CHAIN.BOB]: {
            fetch,
            start: "2024-07-23",
			meta: {
				methodology
			}
        },
        [CHAIN.BSQUARED]: {
            fetch,
            start: "2024-07-03",
			meta: {
				methodology
			}
        },
    },
};

export default adapter;
