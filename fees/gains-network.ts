import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, Dependencies, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from '../helpers/metrics';

interface IStats {
  unix_ts: number;
  day: string;
  blockchain: string;
  daily_volume: number;

  // Fees
  project_fund: number;
  dev_fund: number; // deprecated; only used for older entries
  referral: number;
  nft_bots: number;
  all_fees: number;
  borrowing_fee: number;
  rollover_fee: number;
  cumul_fees: number; // all time chain fees

  // gTokens
  dai_stakers: number;
  usdc_stakers: number;
  weth_stakers: number;

  // GNS staking
  gns_stakers: number;
}

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `select
      *
    from
      dune.gains.result_g_trade_stats_defi_llama
    where
      day >= from_unixtime(${options.startTimestamp})
      AND day < from_unixtime(${options.endTimestamp})`);
};

const fetch = async (_a: number, _b: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const stats: IStats[] = options.preFetchedResults || [];
  const chainStat = stats.find((stat) => stat.unix_ts === options.startOfDay && stat.blockchain === options.chain);
  // const [dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue] = chainStat
  //   ? [chainStat.all_fees, chainStat.dev_fund + chainStat.project_fund + chainStat.gns_stakers, chainStat.gns_stakers, chainStat.dai_stakers + chainStat.usdc_stakers + chainStat.weth_stakers]
  //   : [0, 0, 0, 0];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (chainStat) {
    dailyRevenue.addUSDValue(chainStat.dev_fund + chainStat.project_fund, METRIC.PROTOCOL_FEES);
    dailyRevenue.addUSDValue(chainStat.gns_stakers, METRIC.STAKING_REWARDS);
    dailyHoldersRevenue.addUSDValue(chainStat.gns_stakers, METRIC.STAKING_REWARDS);
  
    dailySupplySideRevenue.addUSDValue(chainStat.dai_stakers + chainStat.usdc_stakers + chainStat.weth_stakers, METRIC.LP_FEES);
    dailySupplySideRevenue.addUSDValue(chainStat.referral, 'Referral Fees');
    dailySupplySideRevenue.addUSDValue(chainStat.nft_bots, METRIC.OPERATORS_FEES);
    dailySupplySideRevenue.addUSDValue(chainStat.borrowing_fee, 'Borrowing Fees');
  }
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const fetchApechain = async (_a: number, _b: ChainBlocks, { createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
  // Dune does not currently support Apechain. Using events until support is added.
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const DIAMOND = "0x2BE5D7058AdBa14Bc38E4A83E94A81f7491b0163";
  const APE = ADDRESSES.apechain.WAPE; // wAPE

  const [govFee, referralFee, triggerFee, stakingFee, gTokenFee, borrowingFee]: any = await Promise.all(
    [
      "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event TriggerFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event GnsOtcFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event GTokenFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event BorrowingFeeCharged(address indexed trader, uint32 indexed index, uint8 indexed collateralIndex, uint256 amountCollateral)",
    ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
  );

  govFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.PROTOCOL_FEES));
  referralFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, 'Refferal Fees'));
  triggerFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.OPERATORS_FEES));
  stakingFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.STAKING_REWARDS));
  gTokenFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.LP_FEES));
  borrowingFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, 'Borrowing Fees'));

  govFee.forEach((i: any) => dailyRevenue.add(APE, i.amountCollateral, METRIC.PROTOCOL_FEES));
  stakingFee.forEach((i: any) => dailyRevenue.add(APE, i.amountCollateral, METRIC.STAKING_REWARDS));

  stakingFee.forEach((i: any) => dailyHoldersRevenue.add(APE, i.amountCollateral, METRIC.STAKING_REWARDS));

  gTokenFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral, METRIC.LP_FEES));
  referralFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral, 'Referral Fees'));

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: "2022-06-03",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2022-12-30",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2024-09-26",
    },
    [CHAIN.APECHAIN]: {
      fetch: fetchApechain,
      start: "2024-11-19",
    },
  },
  prefetch: prefetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Trading fees paid by users.',
    Revenue: 'Share of trading fees to protocol and token holders.',
    SupplySideRevenue: 'Share of trading fees to LPs.',
    HoldersRevenue: 'Share of revenue to buy back and burn GNS tokens.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Fees charged for protocol governance and development fund",
      [METRIC.OPERATORS_FEES]: "Fees paid to bots that execute limit orders and liquidations",
      [METRIC.STAKING_REWARDS]: "Portion of trading fees distributed to GNS token stakers",
      'Referral Fees': "Trading fees distributed to referrers who onboard new traders",
      [METRIC.LP_FEES]: "Fees earned by gToken vault depositors who provide trading liquidity",
      'Borrowing Fees': "Fees charged to traders for maintaining open leveraged positions",
    },
  },
};

export default adapter;
