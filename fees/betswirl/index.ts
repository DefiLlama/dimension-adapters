import * as sdk from "@defillama/sdk";
import { request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const endpoints: any = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('69xMkatN58qWXZS7FXqiVQmvkHhNrq3thTfdB6t85Wvk'),
  [CHAIN.POLYGON]:
    sdk.graph.modifyEndpoint('FL3ePDCBbShPvfRJTaSCNnehiqxsPHzpLud6CpbHoeKW'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('4nQJ4T5TXvTxgECqQ6ox6Nwf57d5BNt6SCn7CzzxjDZN'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AsPBS4ymrjoR61r1x2avNJJtMPvzZ3quMHxvQTgDJbU'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('6rt22DL9aaAjJHDUZ25sSsPuvuKxp1Tnf8LBXhL8WdZi'),
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

const fetch = async ({ chain, createBalances, getFromBlock, getToBlock }: FetchOptions) => {
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


  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  for (const token of graphRes.todayTokens) {
    let tokenKey = token.id.split(':')[0];
    const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount, affiliateAmount } = token

    dailyFees.add(tokenKey, +dividendAmount, "Token holder dividends")
    dailyFees.add(tokenKey, +bankAmount, "Bank fees")
    dailyFees.add(tokenKey, +partnerAmount, "Partner fees")
    dailyFees.add(tokenKey, +treasuryAmount, "Treasury allocation")
    dailyFees.add(tokenKey, +teamAmount, "Team allocation")
    dailyFees.add(tokenKey, +affiliateAmount, "Affiliate fees")
    
    dailySupplySideRevenue.add(tokenKey, +bankAmount, "Bank fees")
    dailySupplySideRevenue.add(tokenKey, +partnerAmount, "Partner fees")
    dailySupplySideRevenue.add(tokenKey, +affiliateAmount, "Affiliate fees")
    
    dailyProtocolRevenue.add(tokenKey, +treasuryAmount, "Treasury allocation")
    dailyProtocolRevenue.add(tokenKey, +teamAmount, "Team allocation")
    
    dailyHoldersRevenue.add(tokenKey, +dividendAmount, "Token holder dividends")
    
    dailyRevenue.add(tokenKey, +treasuryAmount, "Treasury allocation")
    dailyRevenue.add(tokenKey, +teamAmount, "Team allocation")
    dailyRevenue.add(tokenKey, +dividendAmount, "Token holder dividends")
  }
  for (const token of graphPvPRes.todayPvPTokens) {
    let tokenKey = token.id.split(':')[0];
    const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount, affiliateAmount } = token
    
    dailyFees.add(tokenKey, +dividendAmount, "Token holder dividends")
    dailyFees.add(tokenKey, +initiatorAmount, "PvP game host fees")
    dailyFees.add(tokenKey, +treasuryAmount, "Treasury allocation")
    dailyFees.add(tokenKey, +teamAmount, "Team allocation")
    dailyFees.add(tokenKey, +affiliateAmount, "Affiliate fees")
    
    dailySupplySideRevenue.add(tokenKey, +initiatorAmount, "PvP game host fees")
    dailySupplySideRevenue.add(tokenKey, +affiliateAmount, "Affiliate fees")
    
    dailyProtocolRevenue.add(tokenKey, +treasuryAmount, "Treasury allocation")
    dailyProtocolRevenue.add(tokenKey, +teamAmount, "Team allocation")
    
    dailyHoldersRevenue.add(tokenKey, +dividendAmount, "Token holder dividends")
    
    dailyRevenue.add(tokenKey, +treasuryAmount, "Treasury allocation")
    dailyRevenue.add(tokenKey, +teamAmount, "Team allocation")
    dailyRevenue.add(tokenKey, +dividendAmount, "Token holder dividends")
  }

  for (const token of graphRes.yesterdayTokens) {
    let tokenKey = token.id.split(':')[0];
    const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount, affiliateAmount } = token
    dailyFees.add(tokenKey, 0 - +dividendAmount, "Token holder dividends")
    dailyFees.add(tokenKey, 0 - +bankAmount, "Bank fees")
    dailyFees.add(tokenKey, 0 - +partnerAmount, "Partner fees")
    dailyFees.add(tokenKey, 0 - +treasuryAmount, "Treasury allocation")
    dailyFees.add(tokenKey, 0 - +teamAmount, "Team allocation")
    dailyFees.add(tokenKey, 0 - +affiliateAmount, "Affiliate fees")
    
    dailyHoldersRevenue.add(tokenKey, 0 - +dividendAmount, "Token holder dividends")
    
    dailyProtocolRevenue.add(tokenKey, 0 - +treasuryAmount, "Treasury allocation")
    dailyProtocolRevenue.add(tokenKey, 0 - +teamAmount, "Team allocation")
    
    dailyRevenue.add(tokenKey, 0 - +treasuryAmount, "Treasury allocation")
    dailyRevenue.add(tokenKey, 0 - +teamAmount, "Team allocation")
    dailyRevenue.add(tokenKey, 0 - +dividendAmount, "Token holder dividends")
    
    dailySupplySideRevenue.add(tokenKey, 0 - +bankAmount, "Bank fees")
    dailySupplySideRevenue.add(tokenKey, 0 - +partnerAmount, "Partner fees")
    dailySupplySideRevenue.add(tokenKey, 0 - +affiliateAmount, "Affiliate fees")
  }
  for (const token of graphPvPRes.yesterdayPvPTokens) {
    let tokenKey = token.id.split(':')[0];
    const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount, affiliateAmount } = token
    dailyFees.add(tokenKey, 0 - +dividendAmount, "Token holder dividends")
    dailyFees.add(tokenKey, 0 - +initiatorAmount, "PvP game host fees")
    dailyFees.add(tokenKey, 0 - +treasuryAmount, "Treasury allocation")
    dailyFees.add(tokenKey, 0 - +teamAmount, "Team allocation")
    dailyFees.add(tokenKey, 0 - +affiliateAmount, "Affiliate fees")
    
    dailyHoldersRevenue.add(tokenKey, 0 - +dividendAmount, "Token holder dividends")
    
    dailyProtocolRevenue.add(tokenKey, 0 - +treasuryAmount, "Treasury allocation")
    dailyProtocolRevenue.add(tokenKey, 0 - +teamAmount, "Team allocation")
    
    dailyRevenue.add(tokenKey, 0 - +treasuryAmount, "Treasury allocation")
    dailyRevenue.add(tokenKey, 0 - +teamAmount, "Team allocation")
    dailyRevenue.add(tokenKey, 0 - +dividendAmount, "Token holder dividends")
    
    dailySupplySideRevenue.add(tokenKey, 0 - +initiatorAmount, "PvP game host fees")
    dailySupplySideRevenue.add(tokenKey, 0 - +affiliateAmount, "Affiliate fees")
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


const methodology = {
  UserFees: "The player is charged of the fee when a bet is won. Or the PvP game prize pool.",
  Fees: "All fees (called «house edge» from 2.4% to 4% of the payout) comes from the player's bet. The fee has several allocations: Bank, Partner, Affiliate, Dividends, Treasury, and Team. The house edge on PvP games is from 3.5% to 7% allocated to Dividends, Host, Affiliate, Treasury and Team.",
  Revenue: "Dividends, Treasury and Team fee allocations.",
  ProtocolRevenue: "Treasury and Team fee allocations.",
  HoldersRevenue: "Dividends fee allocations.",
  SupplySideRevenue: "Bank and Partner fee allocations, or Host allocation on PvP games.",
};

const breakdownMethodology = {
  Fees: {
    "Token holder dividends": "Dividends distributed to token holders",
    "Bank fees": "Fees to house bank providing betting liquidity",
    "Partner fees": "Fees to platform partners",
    "Treasury allocation": "Fees allocated to protocol treasury",
    "Team allocation": "Fees allocated to core team",
    "Affiliate fees": "Fees to affiliates who refer users",
    "PvP game host fees": "Fees to PvP game hosts",
  },
  Revenue: {
    "Treasury allocation": "Fees allocated to protocol treasury",
    "Team allocation": "Fees allocated to core team",
    "Token holder dividends": "Dividends distributed to token holders",
  },
  ProtocolRevenue: {
    "Treasury allocation": "Fees allocated to protocol treasury",
    "Team allocation": "Fees allocated to core team",
  },
  HoldersRevenue: {
    "Token holder dividends": "Dividends distributed to token holders",
  },
  SupplySideRevenue: {
    "Bank fees": "Fees to house bank providing betting liquidity",
    "Partner fees": "Fees to platform partners",
    "Affiliate fees": "Fees to affiliates who refer users",
    "PvP game host fees": "Fees to PvP game hosts",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2022-07-27' },
    [CHAIN.POLYGON]: { start: '2022-07-27' },
    [CHAIN.AVAX]: { start: '2022-07-27' },
    [CHAIN.ARBITRUM]: { start: '2022-07-27' },
    [CHAIN.BASE]: { start: '2024-11-04' },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
