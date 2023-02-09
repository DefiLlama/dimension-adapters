import { request } from "graphql-request";
import BigNumber from "bignumber.js";

import { api } from "@defillama/sdk";
import { BSC, POLYGON, AVAX } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Chain } from "@defillama/sdk/build/general";

const ten = toBN("10");
function fromWei(wei: string | BigNumber, unit = 18) {
  return toBN(wei).dividedBy(ten.pow(unit));
}
function toBN(wei: string | BigNumber) {
  return new BigNumber(wei);
}

const endpoints: any = {
  [BSC]: "https://api.thegraph.com/subgraphs/name/betswirl/betswirl-bnb",
  [POLYGON]:
    "https://api.thegraph.com/subgraphs/name/betswirl/betswirl-polygon",
  [AVAX]: "https://api.thegraph.com/subgraphs/name/betswirl/betswirl-avalanche",
};

function graphs() {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const { block: yesterdayLastBlock } = await api.util.lookupBlock(
        getTimestampAtStartOfDayUTC(timestamp),
        { chain }
      );
      const graphRes = await request(
        endpoints[chain],
        `{
                tokens {
                    id
                    dividendAmount
                    bankAmount
                    partnerAmount
                    treasuryAmount
                    teamAmount
                }
                yesterdayTokens: tokens(block: { number: ${yesterdayLastBlock} }) {
                    id
                    dividendAmount
                    bankAmount
                    partnerAmount
                    treasuryAmount
                    teamAmount
                }
            }`
      );

      const dailyUserFees: any = {};
      const dailyFees: any = {};
      const dailyRevenue: any = {};
      const dailyProtocolRevenue: any = {};
      const dailyHoldersRevenue: any = {};
      const dailySupplySideRevenue: any = {};
      const totalUserFees: any = {};
      const totalFees: any = {};
      const totalRevenue: any = {};
      const totalProtocolRevenue: any = {};
      const totalDailyHoldersRevenue: any = {};
      const totalSupplySideRevenue: any = {};
      for (const token of graphRes.tokens) {
        const tokenKey = chain + `:` + token.id;

        totalUserFees[tokenKey] = fromWei(
          toBN(token.dividendAmount)
            .plus(token.bankAmount)
            .plus(token.partnerAmount)
            .plus(token.treasuryAmount)
            .plus(token.teamAmount)
        ).toNumber();
        totalFees[tokenKey] = totalUserFees[tokenKey];

        totalSupplySideRevenue[tokenKey] = fromWei(
          toBN(token.bankAmount).plus(token.partnerAmount)
        ).toNumber();

        totalProtocolRevenue[tokenKey] = fromWei(
          toBN(token.treasuryAmount).plus(token.teamAmount)
        ).toNumber();
        totalDailyHoldersRevenue[tokenKey] = fromWei(
          token.dividendAmount
        ).toNumber();
        totalRevenue[tokenKey] =
          totalProtocolRevenue[tokenKey] + totalDailyHoldersRevenue[tokenKey];
      }

      for (const token of graphRes.yesterdayTokens) {
        const tokenKey = chain + `:` + token.id;

        dailyUserFees[tokenKey] =
          totalUserFees[tokenKey] -
          fromWei(
            toBN(token.dividendAmount)
              .plus(token.bankAmount)
              .plus(token.partnerAmount)
              .plus(token.treasuryAmount)
              .plus(token.teamAmount)
          ).toNumber();
        dailyFees[tokenKey] = dailyUserFees[tokenKey];

        dailyHoldersRevenue[tokenKey] =
          totalDailyHoldersRevenue[tokenKey] -
          fromWei(token.dividendAmount).toNumber();
        dailyProtocolRevenue[tokenKey] =
          totalProtocolRevenue[tokenKey] -
          fromWei(toBN(token.treasuryAmount).plus(token.teamAmount)).toNumber();
        dailyRevenue[tokenKey] =
          dailyHoldersRevenue[tokenKey] + dailyProtocolRevenue[tokenKey];

        dailySupplySideRevenue[tokenKey] =
          totalSupplySideRevenue[tokenKey] -
          fromWei(toBN(token.bankAmount).plus(token.partnerAmount)).toNumber();
      }

      return {
        timestamp,
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
        totalFees,
        totalUserFees,
        totalRevenue,
        totalProtocolRevenue,
        totalSupplySideRevenue,
        totalDailyHoldersRevenue,
      };
    };
  };
}

const meta = {
  methodology: {
    UserFees:
      "The player is charged of the fee when a bet is won.",
    Fees: "All fees (called «house edge» from 2.4% to 3.5% of the payout) comes from the player's bet. The fee has several allocations: Bank, Partner, Dividends, Treasury, and Team.",
    Revenue: "Dividends, Treasury and Team fee allocations.",
    ProtocolRevenue: "Treasury and Team fee allocations.",
    HoldersRevenue: "Dividends fee allocations.",
    SupplySideRevenue: "Bank and Partner fee allocations",
  },
};
export default {
  adapter: {
    [BSC]: {
      meta,
      start: () => 1649190350,
      fetch: graphs()(BSC),
    },
    [POLYGON]: {
      meta,
      start: () => 1645968312,
      fetch: graphs()(POLYGON),
    },
    [AVAX]: {
      meta,
      start: () => 1655505906,
      fetch: graphs()(AVAX),
    },
  },
};
