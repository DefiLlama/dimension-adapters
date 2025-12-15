import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"

// https://securitize.io/primary-market/mantle-index-four-fund

const MI4_ADDRESSES = {
    token: '0x671642Ac281C760e34251d51bC9eEF27026F3B7a',
    priceFeed: '0x24c8964338Deb5204B096039147B8e8C3AEa42Cc'
};
const ABIs = {
  "latestRoundData": "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "priceDecimals": "function decimals() view returns (uint8)"
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const [totalSupply, priceData, priceDecimals, tokenDecimals] = await Promise.all([
        options.api.call({
            abi: 'erc20:totalSupply',
            target: MI4_ADDRESSES.token,
        }),
        options.api.call({
            abi: ABIs.latestRoundData,
            target: MI4_ADDRESSES.priceFeed,
        }),
        options.api.call({
            abi: ABIs.priceDecimals,
            target: MI4_ADDRESSES.priceFeed,
        }),
        options.api.call({
            abi: 'erc20:decimals',
            target: MI4_ADDRESSES.token,
        })
    ])

    // Calculate the price per token in USD
    const pricePerTokenUsd = Number(priceData.answer) / (10 ** Number(priceDecimals));
    
    // Calculate actual token supply
    const tokenSupplyFloat = Number(totalSupply) / (10 ** Number(tokenDecimals));
    
    // Calculate TVL in USDC
    const tvlUSD = (tokenSupplyFloat * pricePerTokenUsd);

    const anualFees = tvlUSD * 0.01
    dailyFees.addUSDValue(anualFees / 365, METRIC.MANAGEMENT_FEES)
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyUserFees: dailyFees,
    }
}
const adapters : SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.MANTLE],
    start: '2025-10-24',
    methodology: {
        Fees: "1% management fee",
        Revenue: "Management fee paid by users",
        UserFees: "Management fee paid by users",
    }
};
export default adapters;