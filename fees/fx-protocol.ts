import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";

const tokenMap = {
  wstETH: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  fxUSD: "0x085780639cc2cacd35e474e71f4d000e2405d8f6",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  sfrxETH: "0xac3e018457b222d93114458476f3e3416abbe38f",
  stETH: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
  weETH: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee",
  aCVX: "0xb0903ab70a7467ee5756074b31ac88aebb8fb777",
};

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]:
    "https://api.goldsky.com/api/public/project_cmgz5g9sl0065xhp2aqd9c6sv/subgraphs/fx-fees/v0.0.1/gn",
};

const fetch = async ({ createBalances, startOfDay, chain }: FetchOptions) => {
  let dailyRevenue = createBalances();
  let dailyFee = createBalances();
  const dateId = Math.floor(startOfDay);

  const graphQuery = `{ 
    dailyRevenueSnapshot(id: ${dateId}) { 
      wstETH 
    }
    dailyFeeV1Snapshot(id: ${dateId}) { 
      wstETH
      weETH
      stETH
      sfrxETH
      aCVX
      WBTC 
    }
    dailyFeeV2Snapshot(id: ${dateId}) { 
      wstETH
      USDC
      WBTC
      fxUSD 
    }
  }`;
  const { dailyRevenueSnapshot, dailyFeeV1Snapshot, dailyFeeV2Snapshot } =
    await request(endpoints[chain], graphQuery);

  if (dailyRevenueSnapshot) {
    dailyRevenue.addToken(
      tokenMap.wstETH,
      Number(dailyRevenueSnapshot.wstETH),
    );
  }

  if (dailyFeeV1Snapshot) {
    dailyFee.addToken(tokenMap.wstETH, Number(dailyFeeV1Snapshot.wstETH));
    dailyFee.addToken(tokenMap.weETH, Number(dailyFeeV1Snapshot.weETH));
    dailyFee.addToken(tokenMap.stETH, Number(dailyFeeV1Snapshot.stETH));
    dailyFee.addToken(tokenMap.sfrxETH, Number(dailyFeeV1Snapshot.sfrxETH));
    dailyFee.addToken(tokenMap.aCVX, Number(dailyFeeV1Snapshot.aCVX));
    dailyFee.addToken(tokenMap.WBTC, Number(dailyFeeV1Snapshot.WBTC));
  }

  if (dailyFeeV2Snapshot) {
    dailyFee.addToken(tokenMap.wstETH, Number(dailyFeeV2Snapshot.wstETH));
    dailyFee.addToken(tokenMap.USDC, Number(dailyFeeV2Snapshot.USDC));
    dailyFee.addToken(tokenMap.WBTC, Number(dailyFeeV2Snapshot.WBTC));
    dailyFee.addToken(tokenMap.fxUSD, Number(dailyFeeV2Snapshot.fxUSD));
  }

  const dailyFees = await dailyFee.getUSDValue();

  return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-09-20',
};

export default adapter;
