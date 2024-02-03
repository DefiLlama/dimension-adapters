import { request } from "graphql-request";
import BigNumber from "bignumber.js";

import { Adapter, FetchResultFees } from "../../adapters/types";
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
  return (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultFees> => {
      const yesterdaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const todaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

      const todaysBlock = (await getBlock(todaysTimestamp, chain, {}));
      const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

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

      const coins = [...graphRes.todayTokens, ...graphPvPRes.todayPvPTokens].map((token: IToken | IPvPToken) => {
        if (token.id === "0xfb5b838b6cfeedc2873ab27866079ac55363d37e") {
          return "coingecko:floki";
        } else {
          return chain + ":" + token.id;
        }
      });

      const currentPrices = await getPrices(
        [...coins, `coingecko:binance-usd`],
        timestamp
      );

      if (chain === BSC) {
        // Floki price taken from CG
        currentPrices["bsc:0xfb5b838b6cfeedc2873ab27866079ac55363d37e"] =
          currentPrices["coingecko:floki"];
        currentPrices["bsc:0xe9e7cea3dedca5984780bafc599bd69add087d56"] = currentPrices["coingecko:binance-usd"];
        currentPrices['bsc:0xe9e7cea3dedca5984780bafc599bd69add087d56'].decimals = 18;
        currentPrices['bsc:0xfb5b838b6cfeedc2873ab27866079ac55363d37e'].decimals = 9;
        // Hardcoding TITANO price since it migrated to SWYCH
        if (!currentPrices["bsc:0x4e3cabd3ad77420ff9031d19899594041c420aee"]) {
          currentPrices["bsc:0x4e3cabd3ad77420ff9031d19899594041c420aee"] = {
            decimals: 18,
            symbol: "TITANO",
            price: 0.000015,
            timestamp,
          };
        }// Hardcoding MDB+ price
        if (!currentPrices["bsc:0x9f8bb16f49393eea4331a39b69071759e54e16ea"]) {
          currentPrices["bsc:0x9f8bb16f49393eea4331a39b69071759e54e16ea"] = {
            decimals: 18,
            symbol: "MDB+",
            price: 1.2,
            timestamp,
          };
        }
        // Hardcoding INF-MDB
        if (!currentPrices["bsc:0xacc966b91100f879c9ed4839ed2f77c70e3e97ed"]) {
          currentPrices["bsc:0xacc966b91100f879c9ed4839ed2f77c70e3e97ed"] = {
            decimals: 18,
            symbol: "INF-MDB",
            price: 0, // There was 0 volume anyway
            timestamp,
          };
        }
      }

      const dailyUserFees: TBalance = {};
      const dailyFees: TBalance = {};
      const dailyRevenue: TBalance = {};
      const dailyProtocolRevenue: TBalance = {};
      const dailyHoldersRevenue: TBalance = {};
      const dailySupplySideRevenue: TBalance = {};
      const totalUserFees: TBalance = {};
      const totalFees: TBalance = {};
      const totalRevenue: TBalance = {};
      const totalProtocolRevenue: TBalance = {};
      const totalDailyHoldersRevenue: TBalance = {};
      const totalSupplySideRevenue: TBalance = {};
      for (const token of graphRes.todayTokens) {
        let tokenKey = chain + `:` + token.id.split(':')[0];
        if (!currentPrices[tokenKey.toLocaleLowerCase()]) {
          console.log('not found token: ',tokenKey);
        }
        const tokenDecimals = currentPrices[tokenKey]?.decimals || 0;
        const tokenPrice = currentPrices[tokenKey]?.price || 0;

        totalUserFees[tokenKey] = fromWei(
          toBN(token.dividendAmount)
            .plus(token.bankAmount)
            .plus(token.partnerAmount)
            .plus(token.treasuryAmount)
            .plus(token.teamAmount),
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();
        totalFees[tokenKey] = totalUserFees[tokenKey];

        totalSupplySideRevenue[tokenKey] = fromWei(
          toBN(token.bankAmount).plus(token.partnerAmount),
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();

        totalProtocolRevenue[tokenKey] = fromWei(
          toBN(token.treasuryAmount).plus(token.teamAmount),
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();

        totalDailyHoldersRevenue[tokenKey] = fromWei(
          token.dividendAmount,
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();

        totalRevenue[tokenKey] =
          totalProtocolRevenue[tokenKey] + totalDailyHoldersRevenue[tokenKey];
      }
      for (const token of graphPvPRes.todayPvPTokens) {
        let tokenKey = chain + `:` + token.id.split(':')[0];
        if (!currentPrices[tokenKey.toLocaleLowerCase()]) {
          console.log('not found token: ',tokenKey);
        }
        const tokenDecimals = currentPrices[tokenKey]?.decimals || 0;
        const tokenPrice = currentPrices[tokenKey]?.price || 0;

        if (!totalUserFees[tokenKey]) {
          totalUserFees[tokenKey] = 0
          totalSupplySideRevenue[tokenKey] = 0
          totalProtocolRevenue[tokenKey] = 0
          totalDailyHoldersRevenue[tokenKey] = 0
        }

        totalUserFees[tokenKey] += fromWei(
          toBN(token.dividendAmount)
            .plus(token.initiatorAmount)
            .plus(token.treasuryAmount)
            .plus(token.teamAmount),
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();
        totalFees[tokenKey] = totalUserFees[tokenKey];

        totalSupplySideRevenue[tokenKey] += fromWei(
          token.initiatorAmount,
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();

        totalProtocolRevenue[tokenKey] += fromWei(
          toBN(token.treasuryAmount).plus(token.teamAmount),
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();

        totalDailyHoldersRevenue[tokenKey] += fromWei(
          token.dividendAmount,
          tokenDecimals
        )
          .multipliedBy(tokenPrice)
          .toNumber();

        totalRevenue[tokenKey] =
          totalProtocolRevenue[tokenKey] + totalDailyHoldersRevenue[tokenKey];
      }

      for (const token of graphRes.yesterdayTokens) {
        const tokenKey = chain + `:` + token.id;
        if (!currentPrices[tokenKey.toLocaleLowerCase()]) {
          console.log('not found token: ',tokenKey);
        }
        const tokenDecimals = currentPrices[tokenKey]?.decimals || 0;
        const tokenPrice = currentPrices[tokenKey]?.price || 0;

        dailyUserFees[tokenKey] =
          totalUserFees[tokenKey] -
          fromWei(
            toBN(token.dividendAmount)
              .plus(token.bankAmount)
              .plus(token.partnerAmount)
              .plus(token.treasuryAmount)
              .plus(token.teamAmount),
            tokenDecimals
          )
            .multipliedBy(tokenPrice)
            .toNumber();
        dailyFees[tokenKey] = dailyUserFees[tokenKey];

        dailyHoldersRevenue[tokenKey] =
          totalDailyHoldersRevenue[tokenKey] -
          fromWei(token.dividendAmount, tokenDecimals)
            .multipliedBy(tokenPrice)
            .toNumber();

        dailyProtocolRevenue[tokenKey] =
          totalProtocolRevenue[tokenKey] -
          fromWei(
            toBN(token.treasuryAmount).plus(token.teamAmount),
            tokenDecimals
          )
            .multipliedBy(tokenPrice)
            .toNumber();
        dailyRevenue[tokenKey] =
          dailyHoldersRevenue[tokenKey] + dailyProtocolRevenue[tokenKey];

        dailySupplySideRevenue[tokenKey] =
          totalSupplySideRevenue[tokenKey] -
          fromWei(
            toBN(token.bankAmount).plus(token.partnerAmount),
            tokenDecimals
          )
            .multipliedBy(tokenPrice)
            .toNumber();
      }
      for (const token of graphPvPRes.yesterdayPvPTokens) {
        const tokenKey = chain + `:` + token.id;
        if (!currentPrices[tokenKey.toLocaleLowerCase()]) {
          console.log('not found token: ',tokenKey);
        }
        const tokenDecimals = currentPrices[tokenKey]?.decimals || 0;
        const tokenPrice = currentPrices[tokenKey]?.price || 0;

        if (!dailyUserFees[tokenKey]) {
          dailyUserFees[tokenKey] = 0
          dailyHoldersRevenue[tokenKey] = 0
          dailyProtocolRevenue[tokenKey] = 0
          dailySupplySideRevenue[tokenKey] = 0
        }

        dailyUserFees[tokenKey] -=
          fromWei(
            toBN(token.dividendAmount)
              .plus(token.initiatorAmount)
              .plus(token.treasuryAmount)
              .plus(token.teamAmount),
            tokenDecimals
          )
            .multipliedBy(tokenPrice)
            .toNumber();
        dailyFees[tokenKey] = dailyUserFees[tokenKey];

        dailyHoldersRevenue[tokenKey] -=
          fromWei(token.dividendAmount, tokenDecimals)
            .multipliedBy(tokenPrice)
            .toNumber();

        dailyProtocolRevenue[tokenKey] -=
          fromWei(
            toBN(token.treasuryAmount).plus(token.teamAmount),
            tokenDecimals
          )
            .multipliedBy(tokenPrice)
            .toNumber();
        dailyRevenue[tokenKey] =
          dailyHoldersRevenue[tokenKey] + dailyProtocolRevenue[tokenKey];

        dailySupplySideRevenue[tokenKey] -=
          fromWei(
            token.initiatorAmount,
            tokenDecimals
          )
            .multipliedBy(tokenPrice)
            .toNumber();
      }
      return {
        timestamp,
        dailyFees: Object.values(dailyFees).reduce((a: number, b: number) => a + b, 0).toString(),
        dailyUserFees: Object.values(dailyUserFees).reduce((a: number, b: number) => a + b, 0).toString(),
        dailyRevenue: Object.values(dailyRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        dailyProtocolRevenue: Object.values(dailyProtocolRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        dailyHoldersRevenue: Object.values(dailyHoldersRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        dailySupplySideRevenue: Object.values(dailySupplySideRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        totalFees: Object.values(totalFees).reduce((a: number, b: number) => a + b, 0).toString(),
        totalUserFees: Object.values(totalUserFees).reduce((a: number, b: number) => a + b, 0).toString(),
        totalRevenue: Object.values(totalRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        totalProtocolRevenue: Object.values(totalProtocolRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        totalSupplySideRevenue: Object.values(totalSupplySideRevenue).reduce((a: number, b: number) => a + b, 0).toString(),
        // totalDailyHoldersRevenue,
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
