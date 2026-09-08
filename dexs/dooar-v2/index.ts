import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const DOOAR_PROGRAM_ID = "Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j";

// 1% swap fee. Whitepaper splits it 0.3% LPs / 0.6% ecosystem / 0.1% development,
// but the ecosystem share mixes GMT buybacks, NFT burns, and events, so the
// revenue / supply-side / holders attribution is not clear enough to report.
// https://whitepaper.stepn.com/other-modules/decentralized-exchange
const FEE_RATE = 0.01;

const chainConfig: Record<string, { start: string; factory?: string }> = {
  [CHAIN.BSC]: {
    start: "2022-08-17",
    factory: "0x1e895bFe59E3A5103e8B7dA3897d1F2391476f3c",
  },
  [CHAIN.POLYGON]: {
    start: "2023-08-03",
    factory: "0xbdd46fd173ad1d158578feb5d10573baf8ee89d2",
  },
  [CHAIN.SOLANA]: {
    start: "2022-08-17",
  },
};

const LABEL = {
  SWAP_FEES: "Token Swap Fees",
};

const feesFromVolume = (options: FetchOptions, volumeUsd: number) => {
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(volumeUsd * FEE_RATE, LABEL.SWAP_FEES);
  return { dailyFees, dailyUserFees: dailyFees };
};

const fetchSolana = async (options: FetchOptions) => {
  const data = await queryAllium(`
    SELECT
      COALESCE(SUM(usd_amount), 0) AS daily_volume
    FROM solana.dex.trades
    WHERE project = 'stepn'
      AND protocol = 'stepn'
      AND program_id = '${DOOAR_PROGRAM_ID}'
      AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  const dailyVolume = Number(data[0]?.daily_volume ?? 0);
  return { dailyVolume, ...feesFromVolume(options, dailyVolume) };
};

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);

  const results = await getUniV2LogAdapter({
    factory: chainConfig[options.chain].factory,
    allowReadPairs: true,
    fees: FEE_RATE,
    userFeesRatio: 1,
  })(options);

  const dailyFees = options.createBalances();
  dailyFees.add(results.dailyFees, LABEL.SWAP_FEES);

  return {
    dailyVolume: results.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Volume: "Swap volume from UniV2 pair Swap events on BSC and Polygon, and from Allium solana.dex.trades for the DOOAR/STEPN token-swap program on Solana.",
  Fees: "Users pay a 1% swap fee. The whitepaper splits this across LPs, ecosystem (buybacks/burns/events), and development, but the exact attribution is not reported.",
  UserFees: "Users pay a 1% swap fee.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SWAP_FEES]: "1% swap fee paid by traders.",
  },
  UserFees: {
    [LABEL.SWAP_FEES]: "1% swap fee paid by traders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true, // ecosystem share mixes buybacks, burns, and events; no clean revenue / LP / holders split
};

export default adapter;
