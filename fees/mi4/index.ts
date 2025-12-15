import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import CoreAssets from "../../helpers/coreAssets.json";
import abi from "./abi.json"
import { METRIC } from "../../helpers/metrics"

// https://securitize.io/primary-market/mantle-index-four-fund

const usdc = CoreAssets.mantle.USDC
const MI4_ADDRESSES = {
    token: '0x671642Ac281C760e34251d51bC9eEF27026F3B7a',
    priceFeed: '0x24c8964338Deb5204B096039147B8e8C3AEa42Cc'
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

  try {
    const [totalSupply, priceData, priceDecimals, tokenDecimals] = await Promise.all([
        options.api.call({
            abi: 'erc20:totalSupply',
            target: MI4_ADDRESSES.token,
        }),
        options.api.call({
            abi: abi.latestRoundData,
            target: MI4_ADDRESSES.priceFeed,
        }),
        options.api.call({
            abi: abi.priceDecimals,
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
    const tvlUSDC = (tokenSupplyFloat * pricePerTokenUsd) * 1e6;

    const anualFees = tvlUSDC * 0.01
    dailyFees.add(usdc, anualFees / 365, METRIC.MANAGEMENT_FEES)
  } catch (error) {
    console.error(`Error calculating TVL:`, error.message);
  }
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyUserFees: dailyFees,
    }
}
const adapters : SimpleAdapter = {
    version: 2,
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