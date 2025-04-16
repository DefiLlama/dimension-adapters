import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types";
import { V3Reserve } from "./types";
import { Chain } from "@defillama/sdk/build/general";
import axios from "axios";

const ONE_DAY = 24 * 60 * 60;

const v3Endpoints = {
    [CHAIN.SEI]: "https://api.studio.thegraph.com/query/82370/yei-finance/version/latest",
};

const v3Reserves = async (graphUrls: ChainEndpoints, chain: string, timestamp: number) => {
    const graphQuery = `{
    reserves {
        paramsHistory(
          where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
          orderBy: "timestamp",
          orderDirection: "desc",
          first: 1
        ) {
          id
          priceInEth
          priceInUsd
          reserve {
            decimals
            symbol
            underlyingAsset
          }
          lifetimeFlashLoanLPPremium
          lifetimeFlashLoanProtocolPremium
          lifetimePortalLPFee
          lifetimePortalProtocolFee
          lifetimeReserveFactorAccrued
          lifetimeDepositorsInterestEarned: lifetimeSuppliersInterestEarned
          accruedToTreasury
        }
      }
    }`;
    const graphRes = await request(graphUrls[chain], graphQuery);
    const reserves = await Promise.all(
        graphRes.reserves
            .map((r: any) => r.paramsHistory[0])
            .filter((r: any) => r)
            .map(async (r: any) => {
                const capitalSymbol = r.reserve.symbol.toUpperCase(); // Capitalize the symbol
                if (capitalSymbol !== "USD₮0" && capitalSymbol !== "WSTETH") {
                    const priceRes = await axios.get(
                        `https://api.yei.finance/api/token_price?symbol=${capitalSymbol}&timestamp=${timestamp}`
                    );
                    return {
                        ...r,
                        priceInUsd: priceRes.data.price.toString(),
                    };
                } else {
                    return {
                        ...r,
                        priceInUsd: "0",
                    };
                }
            })
    );
    return reserves;
};

const v3Graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async ({ endTimestamp }: FetchOptions) => {
            const todaysTimestamp = endTimestamp;
            const yesterdaysTimestamp = todaysTimestamp - 60 * 60 * 24;

            const todaysReserves: V3Reserve[] = await v3Reserves(graphUrls, chain, todaysTimestamp);
            const yesterdaysReserves: V3Reserve[] = await v3Reserves(graphUrls, chain, yesterdaysTimestamp);

            const feeBreakdown: any = todaysReserves.reduce(
                (acc, reserve: V3Reserve) => {
                    const yesterdaysReserve = yesterdaysReserves.find(
                        (r: any) => r.reserve.underlyingAsset === reserve.reserve.underlyingAsset
                    );

                    if (!yesterdaysReserve) {
                        return acc;
                    }

                    const priceInUsd = parseFloat(reserve.priceInUsd);

                    const depositorInterest =
                        parseFloat(reserve.lifetimeDepositorsInterestEarned) -
                        parseFloat(yesterdaysReserve?.lifetimeDepositorsInterestEarned);
                    const depositorInterestUSD = (depositorInterest * priceInUsd) / 10 ** reserve.reserve.decimals;

                    const flashloanLPPremium =
                        parseFloat(reserve.lifetimeFlashLoanLPPremium) -
                        parseFloat(yesterdaysReserve.lifetimeFlashLoanLPPremium);
                    const flashloanLPPremiumUSD = (flashloanLPPremium * priceInUsd) / 10 ** reserve.reserve.decimals;

                    const flashloanProtocolPremium =
                        parseFloat(reserve.lifetimeFlashLoanProtocolPremium) -
                        parseFloat(yesterdaysReserve.lifetimeFlashLoanProtocolPremium);
                    const flashloanProtocolPremiumUSD =
                        (flashloanProtocolPremium * priceInUsd) / 10 ** reserve.reserve.decimals;

                    const portalLPFee =
                        parseFloat(reserve.lifetimePortalLPFee) - parseFloat(yesterdaysReserve?.lifetimePortalLPFee);
                    const portalLPFeeUSD = (portalLPFee * priceInUsd) / 10 ** reserve.reserve.decimals;

                    const portalProtocolFee =
                        parseFloat(reserve.lifetimePortalProtocolFee) -
                        parseFloat(yesterdaysReserve?.lifetimePortalProtocolFee);
                    const portalProtocolFeeUSD = (portalProtocolFee * priceInUsd) / 10 ** reserve.reserve.decimals;

                    const treasuryIncome =
                        parseFloat(reserve.lifetimeReserveFactorAccrued) -
                        parseFloat(yesterdaysReserve?.lifetimeReserveFactorAccrued);

                    const outstandingTreasuryIncome =
                        parseFloat(reserve.accruedToTreasury) - parseFloat(yesterdaysReserve?.accruedToTreasury);

                    const treasuryIncomeUSD = (treasuryIncome * priceInUsd) / 10 ** reserve.reserve.decimals;

                    const outstandingTreasuryIncomeUSD =
                        (outstandingTreasuryIncome * priceInUsd) / 10 ** reserve.reserve.decimals;

                    if (depositorInterestUSD < 0 || depositorInterestUSD > 1_000_000) {
                        return acc;
                    }

                    if (treasuryIncomeUSD < 0 || treasuryIncomeUSD > 1_000_000) {
                        return acc;
                    }

                    if (treasuryIncomeUSD < 0 || treasuryIncomeUSD > 1_000_000) {
                        return acc;
                    }

                    acc.outstandingTreasuryIncomeUSD += outstandingTreasuryIncomeUSD;
                    acc.treasuryIncomeUSD += treasuryIncomeUSD;
                    acc.depositorInterestUSD += depositorInterestUSD;
                    acc.flashloanLPPremiumUSD += flashloanLPPremiumUSD;
                    acc.flashloanProtocolPremiumUSD += flashloanProtocolPremiumUSD;
                    acc.portalLPFeeUSD += portalLPFeeUSD;
                    acc.portalProtocolFeeUSD += portalProtocolFeeUSD;
                    return acc;
                },
                {
                    depositorInterestUSD: 0,
                    flashloanLPPremiumUSD: 0,
                    flashloanProtocolPremiumUSD: 0,
                    portalLPFeeUSD: 0,
                    portalProtocolFeeUSD: 0,
                    treasuryIncomeUSD: 0,
                    outstandingTreasuryIncomeUSD: 0,
                }
            );
            const dailyFee = feeBreakdown.depositorInterestUSD + feeBreakdown.treasuryIncomeUSD;
            const dailyRev = feeBreakdown.treasuryIncomeUSD;

            return {
                dailyFees: dailyFee.toString(),
                dailyRevenue: dailyRev.toString(),
            };
        };
    };
};

const adapter = {
    breakdown: {
        v3: {
            [CHAIN.SEI]: {
                fetch: v3Graphs(v3Endpoints)(CHAIN.SEI),
                start: "2025-01-01",
            },
        },
    },
    version: 2,
};

export default adapter;
