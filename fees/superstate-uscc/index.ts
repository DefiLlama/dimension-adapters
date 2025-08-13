import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTokenSupply } from "../../helpers/solana";
import * as sdk from "@defillama/sdk";
import axios from "axios";

const USCC = {
    ethereum: "0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
    plume_mainnet: "0x4c21b7577c8fe8b0b0669165ee7c8f67fa1454cf",
    solana: "BTRR3sj1Bn2ZjuemgbeQ6SCtf84iXS81CS7UDTSxUCaK",
};
const USCC_CHAINLINK_ORACLE = "0xAfFd8F5578E8590665de561bdE9E7BAdb99300d9";

const fetch = async (options: FetchOptions) => {
    const blockToday = (
        await axios.get(
            `https://coins.llama.fi/block/ethereum/${options.toTimestamp}`
        )
    ).data.height;

    const blockYesterday = (
        await axios.get(
            `https://coins.llama.fi/block/ethereum/${options.fromTimestamp}`
        )
    ).data.height;

    const priceTodayRaw = await sdk.api.abi.call({
        target: USCC_CHAINLINK_ORACLE,
        chain: "ethereum",
        abi: "uint256:latestAnswer",
        block: blockToday,
    });

    const priceYesterdayRaw = await sdk.api.abi.call({
        target: USCC_CHAINLINK_ORACLE,
        chain: "ethereum",
        abi: "uint256:latestAnswer",
        block: blockYesterday,
    });

    const priceYesterday = priceYesterdayRaw.output / 1e6;
    const priceToday = priceTodayRaw.output / 1e6;

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
    dailyRevenue.addUSDValue((totalSupply * priceToday * 0.75) / (365 * 100));
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
