import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const fetchDailyStats = async (
  from: number, to: number
): Promise<{ feesETH: number }> => {
  const url = `https://stats.yologames.io/stats?from=${from * 1000}&to=${to * 1000}`;
  const response = await fetchURL(url);
  return { feesETH: response.feesETH };
};

//https://docs.yologames.io/games/game-fees
const FEE_SHARES = {
  RAKE_BACK: 0.45,
  LOTTERY: 0.05,
  BUYBACK: 0.2,
  TREASURY: 0.3,
}

const fetch: any = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  const statsApiResponse = await fetchDailyStats(fromTimestamp, toTimestamp);

  dailyFees.addGasToken(statsApiResponse.feesETH * 1e18, METRIC.PROTOCOL_FEES);

  dailyHoldersRevenue.addGasToken(statsApiResponse.feesETH * 1e18 * FEE_SHARES.BUYBACK, METRIC.TOKEN_BUY_BACK);
  dailyRevenue.addGasToken(statsApiResponse.feesETH * 1e18 * FEE_SHARES.BUYBACK, METRIC.TOKEN_BUY_BACK);

  dailyProtocolRevenue.addGasToken(statsApiResponse.feesETH * 1e18 * FEE_SHARES.TREASURY, 'Protocol Fees to Treasury');
  dailyRevenue.addGasToken(statsApiResponse.feesETH * 1e18 * FEE_SHARES.TREASURY, 'Protocol Fees to Treasury');

  dailySupplySideRevenue.addGasToken(statsApiResponse.feesETH * 1e18 * FEE_SHARES.RAKE_BACK, 'Rake Back to Players');
  dailySupplySideRevenue.addGasToken(statsApiResponse.feesETH * 1e18 * FEE_SHARES.LOTTERY, 'Protocol Fees to Lottery');

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "YOLO Games collects a 1% fee for Moon Or Doom and YOLO winnings, and a 3% fee on Poke The Bear winnings.",
  Revenue: "Includes 20% of the fees for token buybacks and 30% of the fees for the protocol treasury.",
  ProtocolRevenue: "Includes 30% of the fees for the protocol treasury.",
  SupplySideRevenue: "Includes 45% of the fees for the rake back to players and 5% of the fees for the protocol fees to the lottery.",
  HoldersRevenue: "Includes 20% of the fees for the token buybacks.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Includes 1% of the fees for Moon Or Doom and YOLO winnings, and a 3% fee on Poke The Bear winnings.",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "Includes 20% of the fees going to token buybacks.",
    'Protocol Fees to Treasury': "Includes 30% of the fees going to the protocol treasury.",
  },
  ProtocolRevenue: {
    'Protocol Fees to Treasury': "Includes 30% of the fees going to the protocol treasury.",
  },
  SupplySideRevenue: {
    'Rake Back to Players': "Includes 45% of the fees going to the rake back to players.",
    'Protocol Fees to Lottery': "Includes 5% of the fees going to the protocol fees to the lottery.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Includes 20% of the fees going to token buybacks.",
  },
}

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.BLAST],
  start: '2024-03-01',
  fetch,
  pullHourly: true,
};

export default adapter;
