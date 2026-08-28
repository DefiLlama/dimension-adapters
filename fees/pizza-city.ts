import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const BOSS_BAKER_AUCTION = '0x272cD704E5A90b63E3B595744785262d32997B2f';
const WETH = '0x4200000000000000000000000000000000000006';

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const logs = await getLogs({
    target: BOSS_BAKER_AUCTION,
    eventAbi: 'event RoundClearable(uint256 indexed roundId, uint256 clearingPrice, uint256 totalPot, uint256 bidderCount)',
  });

  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  for (const log of logs) {
    const totalPot = log.totalPot;
    if (!totalPot || totalPot === BigInt(0)) continue;
    
    dailyVolume.add(WETH, totalPot);
    const fees = totalPot * BigInt(15) / BigInt(100);
    dailyFees.add(WETH, fees);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-12-19',
    },
  },
  deadFrom: "2026-03-11",
};

adapter.methodology = {
  Volume: "Total ETH bid into Dutch auctions (100% of pot)",
  Fees: "15% of auction pot sent to Treasury for permanent LP",
  Revenue: "15% of auction pot sent to Treasury for permanent LP",
  ProtocolRevenue: "15% of auction pot sent to Treasury for permanent LP",
};

export default adapter;
