import * as sdk from "@defillama/sdk";
import { request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { BSC, POLYGON, AVAX, ARBITRUM } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const endpoints: any = {
  [BSC]: sdk.graph.modifyEndpoint('69xMkatN58qWXZS7FXqiVQmvkHhNrq3thTfdB6t85Wvk'),
  [POLYGON]:
    sdk.graph.modifyEndpoint('FL3ePDCBbShPvfRJTaSCNnehiqxsPHzpLud6CpbHoeKW'),
  [AVAX]: sdk.graph.modifyEndpoint('4nQJ4T5TXvTxgECqQ6ox6Nwf57d5BNt6SCn7CzzxjDZN'),
  [ARBITRUM]: sdk.graph.modifyEndpoint('AsPBS4ymrjoR61r1x2avNJJtMPvzZ3quMHxvQTgDJbU'),
  base: sdk.graph.modifyEndpoint('6rt22DL9aaAjJHDUZ25sSsPuvuKxp1Tnf8LBXhL8WdZi'),
};

interface IToken {
  id: string;
  dividendAmount: string;
  bankAmount: string;
  partnerAmount: string;
  treasuryAmount: string;
  teamAmount: string;
  affiliateAmount: string;
}
interface IPvPToken {
  id: string;
  dividendAmount: string;
  initiatorAmount: string;
  treasuryAmount: string;
  teamAmount: string;
  affiliateAmount: string;
}

interface IGraph {
  todayTokens: IToken[]
  yesterdayTokens: IToken[]
  todayPvPTokens: IPvPToken[]
  yesterdayPvPTokens: IPvPToken[]
}

function graphs() {
  return (chain: Chain): any => {
    return async ({ createBalances, getFromBlock, getToBlock }: FetchOptions) => {
      const todaysBlock = await getToBlock();
      const yesterdaysBlock = await getFromBlock();

      const graphRes: IGraph = await request(
        endpoints[chain],
        `{
              todayTokens: tokens(block: { number: ${todaysBlock} }) {
                    id
                    dividendAmount
                    bankAmount
                    partnerAmount
                    treasuryAmount
                    teamAmount
                    affiliateAmount
                }
                yesterdayTokens: tokens(block: { number: ${yesterdaysBlock} }) {
                    id
                    dividendAmount
                    bankAmount
                    partnerAmount
                    treasuryAmount
                    teamAmount
                    affiliateAmount
                }
            }`
      );
      const graphPvPRes: IGraph = await request(
        endpoints[chain],
        `{
              todayPvPTokens: pvPTokens(block: { number: ${todaysBlock} }) {
                  id
                  dividendAmount
                  initiatorAmount
                  treasuryAmount
                  teamAmount
                  affiliateAmount
              }
              yesterdayPvPTokens: pvPTokens(block: { number: ${yesterdaysBlock} }) {
                  id
                  dividendAmount
                  initiatorAmount
                  treasuryAmount
                  teamAmount
                  affiliateAmount
              }
            }`
      );


      const dailyUserFees = createBalances()
      const dailyFees = createBalances()
      const dailyRevenue = createBalances()
      const dailyProtocolRevenue = createBalances()
      const dailyHoldersRevenue = createBalances()
      const dailySupplySideRevenue = createBalances()
      const totalFees = createBalances()
      const totalRevenue = createBalances()
      const totalProtocolRevenue = createBalances()
      const totalDailyHoldersRevenue = createBalances()
      const totalSupplySideRevenue = createBalances()
      for (const token of graphRes.todayTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount, affiliateAmount } = token

        totalFees.add(tokenKey, +dividendAmount + +bankAmount + +partnerAmount + +treasuryAmount + +teamAmount + +affiliateAmount)
        dailyFees.add(tokenKey, +dividendAmount + +bankAmount + +partnerAmount + +treasuryAmount + +teamAmount + +affiliateAmount)
        totalSupplySideRevenue.add(tokenKey,  +bankAmount + +partnerAmount)
        dailySupplySideRevenue.add(tokenKey,  +bankAmount + +partnerAmount)
        totalProtocolRevenue.add(tokenKey,  +treasuryAmount + +teamAmount)
        dailyProtocolRevenue.add(tokenKey,  +treasuryAmount + +teamAmount)
        totalDailyHoldersRevenue.add(tokenKey, +dividendAmount)
        dailyHoldersRevenue.add(tokenKey, +dividendAmount)
        totalRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount)
        dailyRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount)
      }
      for (const token of graphPvPRes.todayPvPTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount, affiliateAmount } = token
        totalFees.add(tokenKey, +dividendAmount + +initiatorAmount + +treasuryAmount + +teamAmount + +affiliateAmount)
        dailyFees.add(tokenKey, +dividendAmount + +initiatorAmount + +treasuryAmount + +teamAmount + +affiliateAmount)
        totalSupplySideRevenue.add(tokenKey,  +initiatorAmount)
        dailySupplySideRevenue.add(tokenKey,  +initiatorAmount)
        totalProtocolRevenue.add(tokenKey,  +treasuryAmount + +teamAmount)
        dailyProtocolRevenue.add(tokenKey,  +treasuryAmount + +teamAmount)
        totalDailyHoldersRevenue.add(tokenKey, +dividendAmount)
        dailyHoldersRevenue.add(tokenKey, +dividendAmount)
        totalRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount)
        dailyRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount)
      }

      for (const token of graphRes.yesterdayTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount, affiliateAmount } = token
        dailyFees.add(tokenKey, 0 - +dividendAmount - +bankAmount - +partnerAmount - +treasuryAmount - +teamAmount - +affiliateAmount)
        dailyHoldersRevenue.add(tokenKey, 0 - +dividendAmount)
        dailyProtocolRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount)
        dailyRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount - +dividendAmount)
        dailySupplySideRevenue.add(tokenKey, 0 - +bankAmount - +partnerAmount)
      }
      for (const token of graphPvPRes.yesterdayPvPTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount, affiliateAmount } = token
        dailyFees.add(tokenKey, 0 - +dividendAmount - +initiatorAmount - +treasuryAmount - +teamAmount - +affiliateAmount)
        dailyHoldersRevenue.add(tokenKey, 0 - +dividendAmount)
        dailyProtocolRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount)
        dailyRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount - +dividendAmount)
        dailySupplySideRevenue.add(tokenKey, 0 - +initiatorAmount)
      }
      return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
        totalFees,
        totalUserFees: totalFees,
        totalRevenue,
        totalProtocolRevenue,
        totalSupplySideRevenue,
      };
    };
  };
}

const meta = {
  methodology: {
    UserFees: "The player is charged of the fee when a bet is won. Or the PvP game prize pool.",
    Fees: "All fees (called «house edge» from 2.4% to 4% of the payout) comes from the player's bet. The fee has several allocations: Bank, Partner, Affiliate, Dividends, Treasury, and Team. The house edge on PvP games is from 3.5% to 7% allocated to Dividends, Host, Affiliate, Treasury and Team.",
    Revenue: "Dividends, Treasury and Team fee allocations.",
    ProtocolRevenue: "Treasury and Team fee allocations.",
    HoldersRevenue: "Dividends fee allocations.",
    SupplySideRevenue: "Bank and Partner fee allocations, or Host allocation on PvP games.",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [BSC]: {
      start: '2022-07-27',
      fetch: graphs()(BSC),
      meta,
    },
    [POLYGON]: {
      start: '2022-07-27',
      fetch: graphs()(POLYGON),
      meta,
    },
    [AVAX]: {
      start: '2022-07-27',
      fetch: graphs()(AVAX),
      meta,
    },
    [ARBITRUM]: {
      start: '2022-07-27',
      fetch: graphs()(ARBITRUM),
      meta,
    },
    base: {
      start: '2024-11-04',
      fetch: graphs()('base'),
      meta,
    },
  },
}

export default adapter;
