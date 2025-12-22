import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ABI = {
    marketCount: "uint256:market_count",
    markets: "function markets(uint256 arg0) view returns ((address asset_token, address cryptopool, address amm, address lt, address price_oracle, address virtual_pool, address staker))",
    tokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
    pricePerShare: 'uint256:pricePerShare',
    totalSupply: 'uint256:totalSupply',
    balanceOf: 'function balanceOf(address) view returns(uint256)',
    withdrawAdminFees: 'event WithdrawAdminFees (address receiver, uint256 amount)',
    assetToken: 'address:ASSET_TOKEN',
    decimals: 'uint8:decimals',
}

const ADDRESSES = {
    factory: '0x370a449FeBb9411c95bf897021377fe0B7D100c0',
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const markets = await options.api.fetchList({ lengthAbi: ABI.marketCount, itemAbi: ABI.markets, target: ADDRESSES.factory });

    const ltContracts = markets.map((market: any) => market.lt);

    const pricesBefore = await options.fromApi.multiCall({
        calls: ltContracts,
        abi: ABI.pricePerShare,
        permitFailure: true,
    });

    const pricesAfter = await options.toApi.multiCall({
        calls: ltContracts,
        abi: ABI.pricePerShare,
        permitFailure: true,
    });

    const totalSupplies = await options.api.multiCall({
        calls: ltContracts,
        abi: ABI.totalSupply,
        permitFailure: true,
    });

    const stakedSupplies = await options.api.multiCall({
        calls: markets.map((market: any) => ({ target: market.lt, params: market.staker })),
        abi: ABI.balanceOf,
        permitFailure: true
    });

    const adminFeesWithdrawnLogs = await options.getLogs({
        eventAbi: ABI.withdrawAdminFees,
        targets: ltContracts,
        flatten: false
    });

    const assetTokens = await options.api.multiCall({
        calls: ltContracts,
        abi: ABI.assetToken,
        permitFailure: true,
    });

    const assetTokenDecimals = await options.api.multiCall({
        calls: assetTokens,
        abi: ABI.decimals,
        permitFailure: true,
    });

    const ltDecimals = await options.api.multiCall({
        calls: ltContracts,
        abi: ABI.decimals,
        permitFailure: true,
    });

    for (const [index, _market] of markets.entries()) {
        if (!pricesBefore[index] || !pricesAfter[index] || !stakedSupplies[index] || !totalSupplies[index]) continue;

        const ltAndAssetDecimalDifference = ltDecimals[index] - assetTokenDecimals[index];

        const yieldForPeriod = (pricesAfter[index] - pricesBefore[index]) * (totalSupplies[index] - stakedSupplies[index]) / (10 ** ltDecimals[index]);

        dailyFees.addToken(assetTokens[index], yieldForPeriod / (10 ** ltAndAssetDecimalDifference));
        dailySupplySideRevenue.addToken(assetTokens[index], yieldForPeriod / (10 ** ltAndAssetDecimalDifference));

        adminFeesWithdrawnLogs[index].forEach((log: any) => {
            dailyHoldersRevenue.addCGToken(assetTokens[index], (pricesAfter[index] / (10 ** ltDecimals[index])) * (Number(log.amount) / (10 ** ltAndAssetDecimalDifference)));
        })
    }

    dailyFees.add(dailyHoldersRevenue);

    return {
        dailyFees,
        dailyRevenue: dailyHoldersRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue
    }
}

const methodology = {
    Fees: "Trading fees paid by users",
    Revenue: "Part of trading fees (Admin fees)",
    HoldersRevenue: "All the admin fees goes to YB stakers",
    SupplySideRevenue: "Trading fees post admin fee deduction goes to liquidity providers"
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-09-24',
    methodology,
    allowNegativeValue: true,
}

export default adapter;