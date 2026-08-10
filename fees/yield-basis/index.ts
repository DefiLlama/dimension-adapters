import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/**
 * Yield Basis Fee Calculation Notes:
 * https://docs.yieldbasis.com/user/advanced-concepts-economics#5-fee-split--adminfee-dynamics
 * 
 * Fee Flow (per docs):
 * 1. Trading fees generated from BTC/crvUSD Curve pools
 * 2. 50% goes to pool rebalancing (Cryptoswap concentrated liquidity rebalancing)
 * 3. 50% available for distribution, minus volatility decay costs (cost of maintaining 2x leverage)
 * 4. Remaining split between unstaked ybBTC holders and veYB holders via dynamic admin fee
 * 
 * Fee Split Formula:
 * - f_a (admin fee) = 1 - (1 - f_min) * sqrt(1 - s/T)
 * - f_min = 10% (minimum admin fee when nobody stakes)
 * - s = staked ybBTC, T = total ybBTC supply
 * - When s=0: f_a = 10% (LPs keep 90%)
 * - When s=T: f_a = 100% (all fees to veYB since LPs chose emissions)
 * 
 * Value Distribution:
 * - Unstaked ybBTC: receives (1 - f_a) of distributable fees as BTC yield
 * - Staked ybBTC: receives YB emissions (no BTC fees)
 * - veYB holders: receives f_a portion (admin fee) as protocol revenue
 * 
 * FeeDistributor (0xD11b416573EbC59b6B2387DA0D2c0D1b3b1F7A90):
 * - Receives tokens from WithdrawAdminFees on LT contracts
 * - Distributes over 4 weeks (OVER_WEEKS = 4) via fill_epochs()
 * - FundEpoch event: emitted per epoch per token with 1/4 of incoming amount
 * - veYB holders claim based on their voting power at each epoch
 */

const ABI = {
    marketCount: "uint256:market_count",
    markets: "function markets(uint256 arg0) view returns ((address asset_token, address cryptopool, address amm, address lt, address price_oracle, address virtual_pool, address staker))",
    is_killed: 'bool:is_killed',
    tokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
    pricePerShare: 'uint256:pricePerShare',
    totalSupply: 'uint256:totalSupply',
    balanceOf: 'function balanceOf(address) view returns(uint256)',
    withdrawAdminFees: 'event WithdrawAdminFees (address receiver, uint256 amount)',
    assetToken: 'address:ASSET_TOKEN',
    decimals: 'uint8:decimals',
    // FeeDistributor events
    fundEpoch: 'event FundEpoch(uint256 indexed epoch, address indexed token, uint256 amount)',
}

const ADDRESSES = {
    factory: '0x370a449FeBb9411c95bf897021377fe0B7D100c0',
    feeDistributor: '0xD11b416573EbC59b6B2387DA0D2c0D1b3b1F7A90',
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const markets = await options.api.fetchList({ lengthAbi: ABI.marketCount, itemAbi: ABI.markets, target: ADDRESSES.factory });

    const ltContracts = markets.map((market: any) => market.lt);

    const isKilled = await options.api.multiCall({
        calls: ltContracts,
        abi: ABI.is_killed,
        permitFailure: true,
    });

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

    // Track FundEpoch events from FeeDistributor - when admin fees are distributed to veYB holders
    // Note: FundEpoch splits incoming tokens over 4 weeks (OVER_WEEKS), so each event amount is 1/4 of total
    const fundEpochLogs = await options.getLogs({
        target: ADDRESSES.feeDistributor,
        eventAbi: ABI.fundEpoch,
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

    // Build lookup maps for LT token -> asset token conversion
    const ltToAssetToken: Record<string, string> = {};
    const ltToPricePerShare: Record<string, number> = {};
    const ltToDecimals: Record<string, number> = {};
    const ltToAssetDecimals: Record<string, number> = {};

    for (const [index, _market] of markets.entries()) {
        if (!pricesBefore[index] || !pricesAfter[index] || !totalSupplies[index]){
            continue;
        }
        if (isKilled[index] == true) continue;

        const ltAddress = ltContracts[index].toLowerCase();
        ltToAssetToken[ltAddress] = assetTokens[index];
        ltToPricePerShare[ltAddress] = pricesAfter[index];
        ltToDecimals[ltAddress] = ltDecimals[index];
        ltToAssetDecimals[ltAddress] = assetTokenDecimals[index];

        const ltAndAssetDecimalDifference = ltDecimals[index] - assetTokenDecimals[index];

        const yieldForPeriod = (pricesAfter[index] - pricesBefore[index]) * (totalSupplies[index]) / (10 ** ltDecimals[index]);

        dailyFees.addToken(assetTokens[index], yieldForPeriod / (10 ** ltAndAssetDecimalDifference), METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.addToken(assetTokens[index], yieldForPeriod / (10 ** ltAndAssetDecimalDifference), METRIC.ASSETS_YIELDS);
    }

    // Process FundEpoch logs - these show LT tokens entering the distributor for veYB holders
    // If token is not in lookup, it's raw asset value, otherwise convert using pricePerShare
    for (const log of fundEpochLogs) {
        const ltAddress = log.token.toLowerCase();
        const assetToken = ltToAssetToken[ltAddress];
        
        if (!assetToken) {
            // Raw asset value - use ltAddress as the token
            dailyHoldersRevenue.addToken(ltAddress, log.amount, METRIC.PROTOCOL_FEES);
            continue;
        }

        const pricePerShare = ltToPricePerShare[ltAddress];
        const ltDec = ltToDecimals[ltAddress];
        const assetDec = ltToAssetDecimals[ltAddress];

        if (!pricePerShare || !ltDec || !assetDec){
            // console.log("Missing data for ltAddress", ltAddress, "pricePerShare", pricePerShare, "ltDec", ltDec, "assetDec", assetDec)
            continue
        };

        // Convert LT amount to asset value:
        // ltAmount (in 1e18) * pricePerShare (in 1e18) / 10^ltDecimals (1e18) = asset amount in 1e18
        // Then adjust for asset decimals: divide by 10^(ltDec - assetDec) to get asset smallest units
        const ltAndAssetDecimalDiff = ltDec - assetDec;
        const assetAmount = Number(log.amount) * pricePerShare / (10 ** ltDec) / (10 ** ltAndAssetDecimalDiff);
        dailyHoldersRevenue.addToken(assetToken, assetAmount, METRIC.PROTOCOL_FEES);
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
    Fees: "Net trading fees distributed to users (pricePerShare growth + admin fees to veYB)",
    Revenue: "Admin fees distributed to veYB holders via FeeDistributor",
    HoldersRevenue: "Admin fees funded to FeeDistributor epochs for veYB holders",
    SupplySideRevenue: "Fees accrued to all ybBTC holders via pricePerShare growth",
    ProtocolRevenue: "None - all fees go to ybBTC holders and veYB stakers"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Trading fees accrued to unstaked yb Token holders via pricePerShare growth",
        [METRIC.PROTOCOL_FEES]: "Admin fees distributed to veYB holders"
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "Admin fees distributed to veYB holders"
    },
    HoldersRevenue: {
        [METRIC.PROTOCOL_FEES]: "Admin fees funded to FeeDistributor for veYB holders"
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Trading fees accrued to yb Token holders via pricePerShare growth"
    }
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-09-24',
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
}

export default adapter;
