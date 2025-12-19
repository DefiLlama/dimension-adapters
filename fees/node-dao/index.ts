import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

const poolDetails = [
    {
        "pool": "0xf3C79408164abFB6fD5dDfE33B084E4ad2C07c18",
        "nToken": "0xC6572019548dfeBA782bA5a2093C836626C7789A",
        "underlyingToken": ADDRESSES.ethereum.WETH
    }, //nEth
    {
        "pool": "0x0d6F764452CA43eB8bd22788C9Db43E4b5A725Bc",
        "nToken": "0x9Dc7e196092DaC94f0c76CFB020b60FA75B97C5b",
        "underlyingToken": ADDRESSES.ethereum.WETH
    }, //rnEth
    {
        "pool": "0xf0b5b6126ec7ec4B12e52Ce184A47d59bba752b0",
        "nToken": "0x2D83cce82F9a8691524421dB9e9C70873a38c537",
        "underlyingToken": "0x000006c2A22ff4A44ff1f5d0F2ed65F781F55555"
    } //nZkc
];

const ABIs = {
    exchangeRate: "uint256:exchangeRate",
    totalSupply: "uint256:totalSupply",
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();

    const exchangeRatesBefore = await options.fromApi.multiCall({
        calls: poolDetails.map(detail => detail.pool),
        abi: ABIs.exchangeRate,
        permitFailure: true
    });

    const exchangeRatesAfter = await options.toApi.multiCall({
        calls: poolDetails.map(detail => detail.pool),
        abi: ABIs.exchangeRate,
        permitFailure: true
    });

    const totalSupply = await options.api.multiCall({
        calls: poolDetails.map(detail => detail.nToken),
        abi: ABIs.totalSupply,
        permitFailure: true
    });

    for (const [index, { underlyingToken }] of poolDetails.entries()) {
        if (!exchangeRatesBefore[index] || !exchangeRatesAfter[index] ||!totalSupply[index]) continue;
        const yieldForPeriod = (exchangeRatesAfter[index] - exchangeRatesBefore[index]) * totalSupply[index]/1e18;
        dailyFees.add(underlyingToken, yieldForPeriod, METRIC.ASSETS_YIELDS);
    }

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees
    }
}

const methodology = {
    Fees: "Liquid staking and restaking yields on underlying assets.",
    Revenue: "No revenue.",
    SupplySideRevenue: "All the yields go to liquid stakers.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]:"Liquid staking and restaking yields on underlying assets."
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]:"Liquid staking and restaking yields on underlying assets."
    }
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    methodology,
    breakdownMethodology,
    start: '2024-03-26',
    doublecounted: true
};

export default adapter;