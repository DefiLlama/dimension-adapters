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

        dailyFees.add(tokenKey, +dividendAmount + +bankAmount + +partnerAmount + +treasuryAmount + +teamAmount + +affiliateAmount, "House edge fees from winning bets")
        dailySupplySideRevenue.add(tokenKey,  +bankAmount, "Bank fees")
        dailySupplySideRevenue.add(tokenKey,  +partnerAmount, "Partner fees")
        dailyProtocolRevenue.add(tokenKey,  +treasuryAmount, "Treasury allocation")
        dailyProtocolRevenue.add(tokenKey,  +teamAmount, "Team allocation")
        dailyHoldersRevenue.add(tokenKey, +dividendAmount, "Token holder dividends")
        dailyRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount, "Total protocol revenue")
      }
      for (const token of graphPvPRes.todayPvPTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount, affiliateAmount } = token
        dailyFees.add(tokenKey, +dividendAmount + +initiatorAmount + +treasuryAmount + +teamAmount + +affiliateAmount, "House edge fees from PvP games")
        dailySupplySideRevenue.add(tokenKey,  +initiatorAmount, "PvP game host fees")
        dailyProtocolRevenue.add(tokenKey,  +treasuryAmount, "Treasury allocation")
        dailyProtocolRevenue.add(tokenKey,  +teamAmount, "Team allocation")
        dailyHoldersRevenue.add(tokenKey, +dividendAmount, "Token holder dividends")
        dailyRevenue.add(tokenKey,  +treasuryAmount + +teamAmount + +dividendAmount, "Total protocol revenue")
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

const breakdownMethodology = {
  Fees: {
    "House edge fees from winning bets": "House edge fees (2.4%-4% of payout) charged on winning bets from regular betting games, split between Bank, Partner, Dividends, Treasury, and Team",
    "House edge fees from PvP games": "House edge fees (3.5%-7%) charged on PvP game prize pools, split between Dividends, Host, Treasury, and Team",
  },
  Revenue: {
    "Total protocol revenue": "Combined allocation to treasury, team, and token holder dividends from all betting activities",
  },
  ProtocolRevenue: {
    "Treasury allocation": "Portion of house edge fees allocated to the protocol treasury",
    "Team allocation": "Portion of house edge fees allocated to the team",
  },
  HoldersRevenue: {
    "Token holder dividends": "Portion of house edge fees distributed as dividends to token holders",
  },
  SupplySideRevenue: {
    "Bank fees": "Fees allocated to the house bank that provides liquidity for betting games",
    "Partner fees": "Fees allocated to partners who support the platform",
    "PvP game host fees": "Fees allocated to hosts who initiate and manage PvP games",
  },
};

const adapter: Adapter = {
  methodology: info.methodology,
  breakdownMethodology,
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
