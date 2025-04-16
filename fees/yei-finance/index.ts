import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types";
import { V3Reserve } from "./types";
import { Chain } from "@defillama/sdk/build/general";
import axios from "axios";

//remember to lowercase
const poolIDs = {
    WSEI: "0xe30fedd158a2e3b13e9badaeabafc5516e95e8c70x5c57266688a4ad1d3ab61209ebcb967b84227642",
    USDC: "0x3894085ef7ff0f0aedf52e2a2704928d1ec074f10x5c57266688a4ad1d3ab61209ebcb967b84227642",
    ISEI: "0x5cf6826140c1c56ff49c808a1a75407cd1df94230x5c57266688a4ad1d3ab61209ebcb967b84227642",
    WETH: "0x160345fc359604fc6e70e3c5facbde5f7a9342d80x5c57266688a4ad1d3ab61209ebcb967b84227642",
    FASTUSD: "0x37a4dd9ced2b19cfe8fac251cd727b5787e452690x5c57266688a4ad1d3ab61209ebcb967b84227642",
    WBTC: "0x0555e30da8f98308edb960aa94c0db47230d2b9c0x5c57266688a4ad1d3ab61209ebcb967b84227642",
    FRAX: "0x80eede496655fb9047dd39d9f418d5483ed600df0x5c57266688a4ad1d3ab61209ebcb967b84227642",
    USDT: "0xb75d0b03c06a926e488e2659df1a861f860bd3d10x5c57266688a4ad1d3ab61209ebcb967b84227642",
    SFRXETH: "0x3ec3849c33291a9ef4c5db86de593eb4a37fde450x5c57266688a4ad1d3ab61209ebcb967b84227642",
    SFRAX: "0x5bff88ca1442c2496f7e475e9e7786383bc070c00x5c57266688a4ad1d3ab61209ebcb967b84227642",
    FRXETH: "0x43edd7f3831b08fe70b7555ddd373c8bf65a90500x5c57266688a4ad1d3ab61209ebcb967b84227642",
    SFASTUSD: "0xdf77686d99667ae56bc18f539b777dbc2bbe3e9f0x5c57266688a4ad1d3ab61209ebcb967b84227642",
    SOLVBTC: "0x541fd749419ca806a8bc7da8ac23d346f2df8b770x5c57266688a4ad1d3ab61209ebcb967b84227642",
};

const ONE_DAY = 24 * 60 * 60;

const v3Endpoints = {
    [CHAIN.SEI]: "https://api.studio.thegraph.com/query/82370/yei-finance/version/latest",
};

const v3Reserves = async (graphUrls: ChainEndpoints, chain: string, timestamp: number) => {
    const graphQuery = `{
    reserves {
        id
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
