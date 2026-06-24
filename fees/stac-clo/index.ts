import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryAllium } from "../../helpers/allium";
import * as sdk from "@defillama/sdk";

const chainConfig: any = {
    [CHAIN.ETHEREUM]: {
        start: '2025-10-29',
        token: '0x51C2d74017390CbBd30550179A16A1c28F7210fc',
    },
    [CHAIN.SOLANA]: {
        start: '2026-03-03',
        // Live STAC-CLO SPL mint (symbol STAC, 6 decimals).
        // Source: https://solscan.io/token/u49MwZqu4bHRHRsciaBarHK7JZDYGxuaNnwyMBdEKYk
        token: 'u49MwZqu4bHRHRsciaBarHK7JZDYGxuaNnwyMBdEKYk',
    }
}

const METRIC = {
  AssetYields: 'CLO Fund Underlying Assets Yields.',
  AssetYieldsToLP: 'CLO Fund Underlying Assets Yields To LPs.',
  ManagementFees: 'Management Fees - CLO Fund',
}

const priceFeed = "0xEdC6287D3D41b322AF600317628D7E226DD3add4"
const tokenDecimals = 6;
const REDSTONE_ORACLE_DECIMALS = 8;
const MANAGEMENT_FEE = 0.3 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

async function prefetch(options: FetchOptions) {
    const abi = 'function latestAnswer() view returns (int256)';

    // The RedStone NAV feed lives on Ethereum. Read it on Ethereum at the period
    // blocks regardless of which chain is being processed (e.g. Solana), since
    // options.fromApi/toApi otherwise carry the active chain's block context.
    const apiFrom = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp: options.fromTimestamp });
    const apiTo = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp: options.toTimestamp });
    await apiFrom.getBlock();
    await apiTo.getBlock();

    const priceBefore = await apiFrom.call({ target: priceFeed, abi });
    const priceAfter = await apiTo.call({ target: priceFeed, abi });

    return {
        priceChange: (priceAfter - priceBefore) / (10 ** REDSTONE_ORACLE_DECIMALS),
        currentPrice: priceAfter / (10 ** REDSTONE_ORACLE_DECIMALS),
    }
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const priceChange = options.preFetchedResults.priceChange;
    const currentPrice = options.preFetchedResults.currentPrice;

    let totalSupplyAfterDecimals = 0;

    if (options.chain === CHAIN.SOLANA) {
        // getTokenSupply() RPC only returns the CURRENT supply, which would be applied
        // to every historical period during backfills (STAC supply is mutable via
        // mint/burn). Read the point-in-time supply from Allium's per-mint supply
        // snapshots (captured on each mint/burn event); take the latest snapshot at or
        // before the period end. `amount` is already normalized by the token decimals.
        // Source: https://docs.allium.so/historical-data/supported-blockchains/solana
        //         (solana.raw.spl_token_total_supply)
        const sql = `
            SELECT amount AS supply
            FROM solana.raw.spl_token_total_supply
            WHERE mint = '${chainConfig[options.chain].token}'
              AND snapshot_block_timestamp <= TO_TIMESTAMP_NTZ(${options.toTimestamp})
            ORDER BY snapshot_block_slot DESC
            LIMIT 1
        `;
        const rows = await queryAllium(sql);
        totalSupplyAfterDecimals = Number(rows?.[0]?.supply ?? 0);
    } else {
        const totalSupply = await options.api.call({
            target: chainConfig[options.chain].token,
            abi: 'function totalSupply() view returns (uint256)',
        })
        totalSupplyAfterDecimals = totalSupply / (10 ** tokenDecimals);
    }

    const managementFeesForPeriod = currentPrice * totalSupplyAfterDecimals * MANAGEMENT_FEE * (options.toTimestamp - options.fromTimestamp) / ONE_YEAR_IN_SECONDS;
    const yieldForPeriod = priceChange * totalSupplyAfterDecimals;

    dailyFees.addUSDValue(managementFeesForPeriod, METRIC.ManagementFees);
    dailyRevenue.addUSDValue(managementFeesForPeriod, METRIC.ManagementFees);

    dailyFees.addUSDValue(yieldForPeriod, METRIC.AssetYields);
    dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.AssetYieldsToLP);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {   
    Fees: "Increase yields calculated from STAC CLO price change and 0.3% management fees",
    Revenue: "Includes 0.3% management fees collected by the protocol",
    ProtocolRevenue: "Includes 0.3% management fees collected by the protocol",
    SupplySideRevenue: "Includes yields calculated from STAC CLO price change",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.AssetYields]: "Increase yields calculated from STAC CLO price change",
        [METRIC.ManagementFees]: "0.3% management fees collected by the protocol",
    },
    Revenue: {
        [METRIC.ManagementFees]: "0.3% management fees collected by the protocol",
    },
    ProtocolRevenue: {
        [METRIC.ManagementFees]: "0.3% management fees collected by the protocol",
    },
    SupplySideRevenue: {
        [METRIC.AssetYieldsToLP]: "Increase yields calculated from STAC CLO price change",
    },
}

const adapter: SimpleAdapter = {
    version: 1, //price updates once a day
    dependencies: [Dependencies.ALLIUM],
    prefetch,
    fetch,
    breakdownMethodology,
    methodology,
    adapter: chainConfig,
    allowNegativeValue: true,
}

export default adapter;