import { request } from "graphql-request";
import BigNumber from "bignumber.js";

import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { BSC, POLYGON, AVAX, ARBITRUM } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import { getPrices } from "../../utils/prices";
import { getBlock } from "../../helpers/getBlock";

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
  [ARBITRUM]: "https://api.thegraph.com/subgraphs/name/betswirl/betswirl-arbitrum",
};

type TBalance  = {
  [s: string]: number;
}

interface IToken {
  id: string;
  dividendAmount: string;
  bankAmount: string;
  partnerAmount: string;
  treasuryAmount: string;
  teamAmount: string;
}
interface IPvPToken {
  id: string;
  dividendAmount: string;
  initiatorAmount: string;
  treasuryAmount: string;
  teamAmount: string;
}

interface IGraph {
  todayTokens: IToken[]
  yesterdayTokens: IToken[]
  todayPvPTokens: IPvPToken[]
  yesterdayPvPTokens: IPvPToken[]
}

function graphs() {
  return (chain: Chain): any => {
    return async (timestamp: number, _: ChainBlocks, { createBalances, getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultFees> => {
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
                }
                yesterdayTokens: tokens(block: { number: ${yesterdaysBlock} }) {
                    id
                    dividendAmount
                    bankAmount
                    partnerAmount
                    treasuryAmount
                    teamAmount
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
              }
              yesterdayPvPTokens: pvPTokens(block: { number: ${yesterdaysBlock} }) {
                  id
                  dividendAmount
                  initiatorAmount
                  treasuryAmount
                  teamAmount
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
        const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount } = token

        totalFees.add(tokenKey, +dividendAmount + +bankAmount + +partnerAmount + +treasuryAmount + +teamAmount)
        dailyFees.add(tokenKey, +dividendAmount + +bankAmount + +partnerAmount + +treasuryAmount + +teamAmount)
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
        const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount } = token
        totalFees.add(tokenKey, +dividendAmount + +initiatorAmount + +treasuryAmount + +teamAmount)
        dailyFees.add(tokenKey, +dividendAmount + +initiatorAmount + +treasuryAmount + +teamAmount)
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
        const { dividendAmount, bankAmount, partnerAmount, treasuryAmount, teamAmount } = token
        dailyFees.add(tokenKey, 0 - +dividendAmount - +bankAmount - +partnerAmount - +treasuryAmount - +teamAmount)
        dailyHoldersRevenue.add(tokenKey, 0 - +dividendAmount)
        dailyProtocolRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount)
        dailyRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount - +dividendAmount)
        dailySupplySideRevenue.add(tokenKey, 0 - +bankAmount - +partnerAmount)
      }
      for (const token of graphPvPRes.yesterdayPvPTokens) {
        let tokenKey = token.id.split(':')[0];
        const { dividendAmount, initiatorAmount, treasuryAmount, teamAmount } = token
        dailyFees.add(tokenKey, 0 - +dividendAmount - +initiatorAmount - +treasuryAmount - +teamAmount)
        dailyHoldersRevenue.add(tokenKey, 0 - +dividendAmount)
        dailyProtocolRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount)
        dailyRevenue.add(tokenKey, 0 - +treasuryAmount - +teamAmount - +dividendAmount)
        dailySupplySideRevenue.add(tokenKey, 0 - +initiatorAmount)
      }
      return {
        timestamp,
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
    Fees: "All fees (called «house edge» from 2.4% to 3.5% of the payout) comes from the player's bet. The fee has several allocations: Bank, Partner, Dividends, Treasury, and Team. The house edge on PvP games is from 3.5% to 7% allocated to Dividends, Host, Treasury and Team.",
    Revenue: "Dividends, Treasury and Team fee allocations.",
    ProtocolRevenue: "Treasury and Team fee allocations.",
    HoldersRevenue: "Dividends fee allocations.",
    SupplySideRevenue: "Bank and Partner fee allocations, or Host allocation on PvP games.",
  },
  // hallmarks: [
  //   // Polygon
  //   [1645970923, "BetSwirl deposit: 2.6k MATIC"],
  //   [1645976015, "BetSwirl deposit: 1.1k MATIC"],
  //   [1646136632, "BetSwirl deposit: 1.3k MATIC"],
  //   [1647366653, "BetSwirl deposit: 544m BETS"],
  //   [1647445756, "BetSwirl deposit: 7.2k MATIC"],
  //   [1655245802, "Sphere deposit: 1.3m SPHERE"],
  //   // [31115990, "BetSwirl deposit: 9k MATIC"], // Transfer to v2
  //   // [32898892, "BetSwirl deposit: 16.6k MATIC"], // Transfer to v3
  //   // [32898952, "BetSwirl deposit: 554m BETS"], // Transfer to v3
  //   // [35726240, "BetSwirl deposit: 556m BETS"], // Transfer to v4
  //   // [35726240, "BetSwirl deposit: 20.3k MATIC"], // Transfer to v4
  //   [1669205490, "BetSwirl deposit: 5 wETH"],
  //   [1669330628, "Jarvis deposit: 106k jMXN"],
  //   [1669330780, "Jarvis deposit: 5.3k jEUR"],
  //   [1675356553, "Jarvis deposit: 15.7k jEUR"],
  //   [1675420032, "BetSwirl deposit: 21k MATIC"],
  //   [1675815093, "BetSwirl deposit: 777M PolyDoge"],

  //   // BNB
  //   [1649191463, "BetSwirl deposit: 10 BNB"],
  //   [1649616314, "BetSwirl deposit: 75m BETS"],
  //   [1652807622, "BetSwirl deposit: 29 BNB"],
  //   [1652808633, "BetSwirl deposit: 75m BETS"],
  //   [1654293017, "Titano deposit: 40m TITANO"],
  //   [1655707329, "BetSwirl deposit: 51m BETS"], // to check
  //   [1659023680, "BetSwirl deposit: 15 BNB"],
  //   // [21190276, "BetSwirl deposit: 49 BNB"], // Transfer to v3
  //   // [21190300, "BetSwirl deposit: 197m BETS"], // Transfer to v3
  //   // [21526500, "Titano deposit: 240m TITANO"], // Transfer to v3
  //   // [23129957, "BetSwirl deposit: 57 BNB"], // Transfer to v4
  //   // [23129957, "BetSwirl deposit: 199m BETS"], // Transfer to v4
  //   [1670448025, "MDB deposit: 3m MDB"],
  //   [1670448049, "MDB deposit: 15.5k MDB+"],

  //   // Avalanche
  //   [1655506365, "BetSwirl deposit: 350 AVAX"],
  //   [1655506474, "BetSwirl deposit: 23m BETS"],
  //   [1655519330, "BetSwirl deposit: 127m BETS"],
  //   [1655707066, "BetSwirl deposit: 50m BETS"],
  //   // [19714942, "BetSwirl deposit: 395 AVAX"], // Transfer to v3
  //   [1662768298, "ThorFi deposit: 27k THOR"],
  //   // [19714974, "BetSwirl deposit: 200m BETS"], // Transfer to v3
  // ],
};

const adapter: Adapter = {
  adapter: {
    [BSC]: {
      start: 1658880000,
      fetch: graphs()(BSC),
      meta,
    },
    [POLYGON]: {
      start: 1658880000,
      fetch: graphs()(POLYGON),
      meta,
    },
    [AVAX]: {
      start: 1658880000,
      fetch: graphs()(AVAX),
      meta,
    },
    [ARBITRUM]: {
      start: 1658880000,
      fetch: graphs()(ARBITRUM),
      meta,
    },
  },
}

export default adapter;
