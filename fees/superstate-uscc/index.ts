import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTokenSupply } from "../../helpers/solana";
import * as sdk from "@defillama/sdk";

const USCC = {
    ethereum: "0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
    plume_mainnet: "0x4c21b7577c8fe8b0b0669165ee7c8f67fa1454cf",
    solana: "BTRR3sj1Bn2ZjuemgbeQ6SCtf84iXS81CS7UDTSxUCaK",
};
const USCC_CHAINLINK_ORACLE = "0xAfFd8F5578E8590665de561bdE9E7BAdb99300d9";

async function getPrices(timestamp: number): Promise<number> {
    const blockNumber = await sdk.blocks.getBlockNumber(CHAIN.ETHEREUM, timestamp);

    const price = await sdk.api.abi.call({
        chain: CHAIN.ETHEREUM,
        abi: "uint256:latestAnswer",
        target: USCC_CHAINLINK_ORACLE,
        block: blockNumber
    });
    return price.output / 1e6;
}

const fetch = async (options: FetchOptions) => {
    const priceToday = await getPrices(options.toTimestamp)
    const priceYesterday = await getPrices(options.fromTimestamp)

    let totalSupply =
        options.chain === "solana"
            ? await getTokenSupply(USCC[options.chain])
            : await options.api.call({
                abi: "uint256:totalSupply",
                target: USCC[options.chain],
            });

    totalSupply /= options.chain == "solana" ? 1 : 1e6;
    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(totalSupply * (priceToday - priceYesterday));

    const dailyRevenue = options.createBalances();
    const oneYear = 365 * 24 * 60 * 60;
    const timeFrame = options.toTimestamp- options.fromTimestamp;
    dailyRevenue.addUSDValue((totalSupply * priceToday * 0.0075 * timeFrame) / oneYear);
    dailyFees.add(dailyRevenue);

    return {
        dailyFees,
        dailyRevenue,
    };
};

const methodology = {
    Fees: "Total Yields from Superstate USCC basis trading",
    Revenue: "0.75% Annual Management fee collected by superstate",
};

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.PLUME, CHAIN.SOLANA],
    start: "2024-08-05",
};

export default adapter;
