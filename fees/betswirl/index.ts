import * as sdk from "@defillama/sdk";
import { request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";

const endpoints: any = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('69xMkatN58qWXZS7FXqiVQmvkHhNrq3thTfdB6t85Wvk'),
  [CHAIN.POLYGON]:
    sdk.graph.modifyEndpoint('FL3ePDCBbShPvfRJTaSCNnehiqxsPHzpLud6CpbHoeKW'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('4nQJ4T5TXvTxgECqQ6ox6Nwf57d5BNt6SCn7CzzxjDZN'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AsPBS4ymrjoR61r1x2avNJJtMPvzZ3quMHxvQTgDJbU'),
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
      for (const token of graphRes.todayTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount, affiliateAmount } = token

        dailyFees.add(tokenKey, +dividendAmount + +bankAmount + +partnerAmount + +treasuryAmount + +teamAmount + +affiliateAmount)
        dailySupplySideRevenue.add(tokenKey,  +bankAmount + +partnerAmount)
        dailyProtocolRevenue.add(tokenKey,  +treasuryAmount + +teamAmount)
        dailyHoldersRevenue.add(tokenKey, +dividendAmount)
        dailyRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount)
      }
      for (const token of graphPvPRes.todayPvPTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount, affiliateAmount } = token
        dailyFees.add(tokenKey, +dividendAmount + +initiatorAmount + +treasuryAmount + +teamAmount + +affiliateAmount)
        dailySupplySideRevenue.add(tokenKey,  +initiatorAmount)
        dailyProtocolRevenue.add(tokenKey,  +treasuryAmount + +teamAmount)
        dailyHoldersRevenue.add(tokenKey, +dividendAmount)
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
      };
    };
  };
}

const info = {
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
  methodology: info.methodology,
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      start: '2022-07-27',
      fetch: graphs()(CHAIN.BSC),
    },
    [CHAIN.POLYGON]: {
      start: '2022-07-27',
      fetch: graphs()(CHAIN.POLYGON),
    },
    [CHAIN.AVAX]: {
      start: '2022-07-27',
      fetch: graphs()(CHAIN.AVAX),
    },
    [CHAIN.ARBITRUM]: {
      start: '2022-07-27',
      fetch: graphs()(CHAIN.ARBITRUM),
    },
    [CHAIN.BASE]: {
      start: '2024-11-04',
      fetch: graphs()(CHAIN.BASE),
    },
  },
}

export default adapter;
