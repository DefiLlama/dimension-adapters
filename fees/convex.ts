import * as sdk from "@defillama/sdk";
import {Adapter, FetchOptions, FetchResultFees} from "../adapters/types";
import {ETHEREUM} from "../helpers/chains";
import {request, gql} from "graphql-request";
import type {ChainEndpoints} from "../adapters/types"
import {Chain} from '@defillama/sdk/build/general';
import {getTimestampAtStartOfDayUTC} from "../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
    [ETHEREUM]:
        sdk.graph.modifyEndpoint('86irRVuFotfaCFwtFxiSaJ76Y8pxfU3xX91gU6CoYTvi'),
};

// Constants for on-chain data
const CONVEX_PERMA_STAKER = "0xCCCCCccc94bFeCDd365b4Ee6B86108fC91848901".toLowerCase();
const reUSD = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec";
const registry = "0x10101010E0C3171D894B71B3400668aF311e7D94";

// ABIs
const abi = {
    getAddress: "function getAddress(string key) external view returns (address)",
    rewardPaid: "event RewardPaid(address indexed user, address indexed rewardToken, address indexed recipient, uint256 reward)"
};

const methodology = {
    UserFees: "No user fees",
    Fees: "Includes all treasury revenue, all revenue to CVX lockers and stakers and all revenue to liquid derivatives (cvxCRV, cvxFXS)",
    HoldersRevenue: "All revenue going to CVX lockers and stakers, including bribes",
    Revenue: "Sum of protocol revenue and holders' revenue",
    ProtocolRevenue: "Share of revenue going to Convex treasury (includes caller incentives on Frax pools, POL yield and Votemarket bribes)",
    SupplySideRevenue: "All CRV, CVX and FXS rewards redistributed to liquidity providers staking on Convex.",
}

const graphFetch = async (timestamp: number, graphUrls: ChainEndpoints, chain: Chain): Promise<any> => {
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp));

    const graphQuery = gql
            `{
            dailyRevenueSnapshot(id: ${dateId}) {
                crvRevenueToLpProvidersAmount
                cvxRevenueToLpProvidersAmount
                fxsRevenueToLpProvidersAmount
                crvRevenueToCvxCrvStakersAmount
                cvxRevenueToCvxCrvStakersAmount
                threeCrvRevenueToCvxCrvStakersAmount
                fxsRevenueToCvxFxsStakersAmount
                crvRevenueToCvxStakersAmount
                fxsRevenueToCvxStakersAmount
                crvRevenueToCallersAmount
                fxsRevenueToCallersAmount
                crvRevenueToPlatformAmount
                fxsRevenueToPlatformAmount
                otherRevenue
                bribeRevenue
            }
        }`;

    const graphRes = await request(graphUrls[chain], graphQuery);
    Object.keys(graphRes.dailyRevenueSnapshot).map(function (k) {
        graphRes.dailyRevenueSnapshot[k] = new BigNumber(graphRes.dailyRevenueSnapshot[k])
    });

    return graphRes.dailyRevenueSnapshot;
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
    const timestamp = options.startTimestamp;
    const chain = options.chain;

    // Get data from subgraph
    const snapshot = await graphFetch(timestamp, endpoints, chain);

    // Initialize reUSD revenue
    let reUSDRevenue = new BigNumber(0);

    // Only fetch on-chain data if we're past the reUSD integration date
    const isAfterReUSDIntegration = timestamp >= 1711152000; // 2025-03-23 00:00:00 UTC

    if (isAfterReUSDIntegration) {
        // Get the staker contract address
        const stakerAddress = await options.api.call({
            target: registry,
            abi: abi.getAddress,
            params: ["STAKER"]
        });

        // Fetch RewardPaid events
        const rewardPaidLogs = await options.getLogs({
            target: stakerAddress,
            eventAbi: abi.rewardPaid
        });

        // Sum the rewards where user is CONVEX_PERMA_STAKER and rewardToken is reUSD
        rewardPaidLogs.forEach(log => {
            if (
                log.user.toLowerCase() === CONVEX_PERMA_STAKER &&
                log.rewardToken.toLowerCase() === reUSD.toLowerCase()
            ) {
                reUSDRevenue = reUSDRevenue.plus(new BigNumber(log.reward).div(1e18));
            }
        });
    }

    // All revenue redirected to LPs
    const dailySupplySideRev = snapshot.crvRevenueToLpProvidersAmount
        .plus(snapshot.cvxRevenueToLpProvidersAmount)
        .plus(snapshot.fxsRevenueToLpProvidersAmount);

    // Revenue to CVX Holders, including bribes (minus Votium fee)
    const dailyHoldersRevenue = snapshot.crvRevenueToCvxStakersAmount
        .plus(snapshot.fxsRevenueToCvxStakersAmount)

    const dailyBribeRevenue = snapshot.bribeRevenue;

    // cvxCRV & cvxFXS liquid lockers revenue
    const liquidRevenue = snapshot.crvRevenueToCvxCrvStakersAmount
        .plus(snapshot.cvxRevenueToCvxCrvStakersAmount)
        .plus(snapshot.threeCrvRevenueToCvxCrvStakersAmount)
        .plus(snapshot.fxsRevenueToCvxFxsStakersAmount);

    // Share of revenue redirected to treasury
    const dailyTreasuryRevenue = snapshot.crvRevenueToPlatformAmount
        .plus(snapshot.fxsRevenueToPlatformAmount)
        .plus(snapshot.fxsRevenueToCallersAmount)
        .plus(snapshot.otherRevenue)
        .plus(reUSDRevenue);

    // Platform fee on CRV rewards + Rewards to liquid lockers + Rewards to CVX holders
    const dailyFees = dailyTreasuryRevenue.plus(liquidRevenue).plus(dailyHoldersRevenue);
    // No fees levied on users
    const dailyUserFees = 0;
    // Platform fee on CRV/FXS rewards + Gov token holder revenue
    const dailyRevenue = dailyTreasuryRevenue.plus(dailyHoldersRevenue);

    return {
        timestamp,
        dailyFees,
        dailyUserFees: dailyUserFees,
        dailyHoldersRevenue: dailyHoldersRevenue,
        dailyProtocolRevenue: dailyTreasuryRevenue,
        dailySupplySideRevenue: dailySupplySideRev,
        dailyBribesRevenue: dailyBribeRevenue,
        dailyRevenue,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [ETHEREUM]: {
            fetch,
            start: '2021-05-17',
            meta: {
                methodology
            }
        }
    }
}

export default adapter;