import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const thBill = "0x5FA487BCa6158c64046B2813623e20755091DA0b";
const thBillOFT = "0xfDD22Ce6D1F66bc0Ec89b20BF16CcB6670F55A5a";

const convertToAssetsAbi = "function convertToAssets(uint256 shares) view returns (uint256)";

async function prefetch(options: FetchOptions): Promise<any> {
    const priceYesterday = await options.fromApi.call({
        target: thBill,
        abi: convertToAssetsAbi,
        params: [1e6],
        chain: CHAIN.ETHEREUM
    });

    const priceToday = await options.toApi.call({
        target: thBill,
        abi: convertToAssetsAbi,
        params: [1e6],
        chain: CHAIN.ETHEREUM
    });

    return (priceToday - priceYesterday) / 1e6;
}

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyPriceChange = options.preFetchedResults;

    let totalSupply = 0;
    if (options.chain === CHAIN.ETHEREUM) {
        const maxTotalSupply = await options.api.call({
            target: thBill,
            abi: 'uint256:totalSupply'
        });
        const oftLockedSupply = await options.api.call({
            target: thBill,
            abi: 'function balanceOf(address) view returns (uint256)',
            params: [thBillOFT]
        });
        totalSupply = maxTotalSupply - oftLockedSupply;
    }
    else {
        totalSupply = await options.api.call({
            target: thBillOFT,
            abi: 'uint256:totalSupply'
        });
    }

    dailyFees.addUSDValue(dailyPriceChange * totalSupply / 1e6),METRIC.ASSETS_YIELDS;

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Treasury yields from underlying",
    Revenue: "No revenue",
    SupplySideRevenue:"Treasury yields received by users"
};

const adapter: SimpleAdapter = {
    version: 1,
    prefetch,
    fetch,
    methodology,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2025-07-22' },
        [CHAIN.BASE]: { start: '2025-08-04' },
        [CHAIN.ARBITRUM]: { start: '2025-08-04' },
        [CHAIN.HYPERLIQUID]: { start: '2025-08-04' },
        [CHAIN.STABLE]: { start: '2025-12-08' },
    },
    allowNegativeValue: true //sometimes daily returns goes negative(thBill is underlying of thUltra which has fee), ignoring this could give inaccurate total fees
};

export default adapter;