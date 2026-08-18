import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const DOOAR_PROGRAM_ID = "Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j";

// 1% swap fee: 0.3% LPs, 0.6% ecosystem (buybacks/burns/events), 0.1% development
// https://whitepaper.stepn.com/other-modules/decentralized-exchange
const FEE_RATE = 0.01;
const LP_SHARE = 0.3;
const ECOSYSTEM_SHARE = 0.6;
const DEV_SHARE = 0.1;

const feeConfig = {
  fees: FEE_RATE,
  userFeesRatio: 1,
  revenueRatio: ECOSYSTEM_SHARE + DEV_SHARE,
  protocolRevenueRatio: DEV_SHARE,
  holdersRevenueRatio: ECOSYSTEM_SHARE,
};

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
  LP_FEES: "Swap Fees To Liquidity Providers",
  PROTOCOL_FEES: "Swap Fees To Protocol",
  ECOSYSTEM_FEES: "Swap Fees To Ecosystem",
};

const feeBreakdownFromVolume = (options: FetchOptions, volumeUsd: number) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const feesUsd = volumeUsd * FEE_RATE;
  dailyFees.addUSDValue(feesUsd, LABEL.SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(feesUsd * LP_SHARE, LABEL.LP_FEES);
  dailyProtocolRevenue.addUSDValue(feesUsd * DEV_SHARE, LABEL.PROTOCOL_FEES);
  dailyHoldersRevenue.addUSDValue(feesUsd * ECOSYSTEM_SHARE, LABEL.ECOSYSTEM_FEES);
  dailyRevenue.addUSDValue(feesUsd * DEV_SHARE, LABEL.PROTOCOL_FEES);
  dailyRevenue.addUSDValue(feesUsd * ECOSYSTEM_SHARE, LABEL.ECOSYSTEM_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyRevenue,
  };
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
  return { dailyVolume, ...feeBreakdownFromVolume(options, dailyVolume) };
};

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);

  const results = await getUniV2LogAdapter({
    factory: chainConfig[options.chain].factory,
    allowReadPairs: true,
    ...feeConfig,
  })(options);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.add(results.dailyFees, LABEL.SWAP_FEES);
  dailySupplySideRevenue.add(results.dailyFees.clone(LP_SHARE), LABEL.LP_FEES);
  dailyProtocolRevenue.add(results.dailyFees.clone(DEV_SHARE), LABEL.PROTOCOL_FEES);
  dailyHoldersRevenue.add(results.dailyFees.clone(ECOSYSTEM_SHARE), LABEL.ECOSYSTEM_FEES);
  dailyRevenue.add(results.dailyFees.clone(DEV_SHARE), LABEL.PROTOCOL_FEES);
  dailyRevenue.add(results.dailyFees.clone(ECOSYSTEM_SHARE), LABEL.ECOSYSTEM_FEES);

  return {
    dailyVolume: results.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyRevenue,
  };
};

const methodology = {
  Volume: "Swap volume from UniV2 pair Swap events on BSC and Polygon, and from Allium solana.dex.trades for the DOOAR/STEPN token-swap program on Solana.",
  Fees: "Users pay a 1% swap fee.",
  UserFees: "Users pay a 1% swap fee.",
  SupplySideRevenue: "0.3% of swap volume is paid to liquidity providers.",
  Revenue: "0.7% of swap volume: 0.6% to the STEPN ecosystem and 0.1% to development.",
  HoldersRevenue: "0.6% of swap volume is held for ecosystem use (GMT buybacks, NFT burns, events).",
  ProtocolRevenue: "0.1% of swap volume funds future development.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SWAP_FEES]: "1% swap fee paid by traders.",
  },
  UserFees: {
    [LABEL.SWAP_FEES]: "1% swap fee paid by traders.",
  },
  SupplySideRevenue: {
    [LABEL.LP_FEES]: "0.3% of swap volume paid to liquidity providers.",
  },
  Revenue: {
    [LABEL.PROTOCOL_FEES]: "0.1% of swap volume funds future development.",
    [LABEL.ECOSYSTEM_FEES]: "0.6% of swap volume held for ecosystem use (GMT buybacks, NFT burns, events).",
  },
  ProtocolRevenue: {
    [LABEL.PROTOCOL_FEES]: "0.1% of swap volume funds future development.",
  },
  HoldersRevenue: {
    [LABEL.ECOSYSTEM_FEES]: "0.6% of swap volume held for ecosystem use (GMT buybacks, NFT burns, events).",
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
};

export default adapter;
