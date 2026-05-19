import ADDRESSES from '../../helpers/coreAssets.json'
import { ChainBlocks, Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from '../../helpers/metrics';

interface IStats {
  unix_ts: number;
  day: string;
  blockchain: string;
  daily_volume: number;

  // Fees
  project_fund: number;
  dev_fund: number;
  referral: number;
  nft_bots: number;
  borrowing_fee: number;

  // gTokens (supply side)
  dai_stakers: number;
  usdc_stakers: number;
  weth_stakers: number;
  usdm_stakers: number;
  btcusd_stakers: number;
  ggns_stakers: number;

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
      and day < from_unixtime(${options.endTimestamp})`
  );
};

const fetch: any = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const stats: IStats[] = options.preFetchedResults || [];
  const chainStat = stats.find((stat) => stat.unix_ts === options.startOfDay && stat.blockchain === options.chain);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (chainStat) {
    dailyRevenue.addUSDValue(chainStat.dev_fund + chainStat.project_fund, METRIC.PROTOCOL_FEES);
    dailyRevenue.addUSDValue(chainStat.gns_stakers, METRIC.STAKING_REWARDS);
    dailyHoldersRevenue.addUSDValue(chainStat.gns_stakers, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addUSDValue(
      chainStat.dai_stakers + chainStat.usdc_stakers + chainStat.weth_stakers + chainStat.usdm_stakers + chainStat.btcusd_stakers + chainStat.ggns_stakers,
      METRIC.LP_FEES
    );
    dailySupplySideRevenue.addUSDValue(chainStat.referral, 'Referral Fees');
    dailySupplySideRevenue.addUSDValue(chainStat.nft_bots, METRIC.OPERATORS_FEES);
    dailySupplySideRevenue.addUSDValue(chainStat.borrowing_fee, 'Borrowing Fees');
  }
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    timestamp,
    dailyVolume: chainStat?.daily_volume || 0,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const fetchApechain: any = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs }: FetchOptions) => {
  // Apechain currently not supported on Dune, must fetch from Events
  const DIAMOND = "0x2BE5D7058AdBa14Bc38E4A83E94A81f7491b0163";
  const APE = ADDRESSES.apechain.WAPE;

  const [limitLogs, marketLogs, partialIncreaseLogs, partialDecreaseLogs, govFee, referralFee, triggerFee, stakingFee, gTokenFee, borrowingFee]: any = await Promise.all(
    [
      "event LimitExecuted((address user, uint32 index) orderId, address indexed user, uint32 indexed index, uint32 indexed limitIndex, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, address triggerCaller, uint8 orderType, uint256 oraclePrice, uint256 marketPrice, uint256 liqPrice, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd, bool exactExecution)",
      "event MarketExecuted((address user, uint32 index) orderId, address indexed user, uint32 indexed index, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, bool open, uint256 oraclePrice, uint256 marketPrice, uint256 liqPrice, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd)",
      "event PositionSizeIncreaseExecuted((address user, uint32 index) orderId, uint8 cancelReason, uint8 indexed collateralIndex, address indexed trader, uint256 pairIndex, uint256 indexed index, bool long, uint256 oraclePrice, uint256 collateralPriceUsd, uint256 collateralDelta, uint256 leverageDelta, (uint256 positionSizeCollateralDelta, uint256 existingPositionSizeCollateral, uint256 newPositionSizeCollateral, uint256 newCollateralAmount, uint256 newLeverage, uint256 priceAfterImpact, int256 existingPnlCollateral, uint256 oldPosSizePlusPnlCollateral, uint256 newOpenPrice, uint256 borrowingFeeCollateral, uint256 openingFeesCollateral, uint256 existingLiqPrice, uint256 newLiqPrice) vals)",
      "event PositionSizeDecreaseExecuted((address user, uint32 index) orderId, uint8 cancelReason, uint8 indexed collateralIndex, address indexed trader, uint256 pairIndex, uint256 indexed index, bool long, uint256 oraclePrice, uint256 collateralPriceUsd, uint256 collateralDelta, uint256 leverageDelta, (uint256 positionSizeCollateralDelta, uint256 existingPositionSizeCollateral, uint256 existingLiqPrice, uint256 priceAfterImpact, int256 existingPnlCollateral, uint256 borrowingFeeCollateral, uint256 closingFeeCollateral, int256 availableCollateralInDiamond, int256 collateralSentToTrader, uint120 newCollateralAmount, uint24 newLeverage) vals)",
      "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event TriggerFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event GnsOtcFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event GTokenFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event BorrowingFeeCharged(address indexed trader, uint32 indexed index, uint8 indexed collateralIndex, uint256 amountCollateral)",
    ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
  );

  const [BI_1e3, BI_1e18, BI_1e8] = [1000n, BigInt(1e18), BigInt(1e8)];

  const volumeLimitsAndMarkets = limitLogs
    .concat(marketLogs)
    .map((e: any) => Number(BigInt(e.t.collateralAmount) * BigInt(e.t.leverage) * BigInt(e.collateralPriceUsd) / BI_1e18 / BI_1e3 / BI_1e8))
    .reduce((a: number, b: number) => a + b, 0);

  const volumePartials = partialIncreaseLogs
    .concat(partialDecreaseLogs)
    .map((e: any) => Number(BigInt(e.vals.positionSizeCollateralDelta) * BigInt(e.collateralPriceUsd) / BI_1e18 / BI_1e8))
    .reduce((a: number, b: number) => a + b, 0);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  govFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.PROTOCOL_FEES));
  referralFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, 'Referral Fees'));
  triggerFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.OPERATORS_FEES));
  stakingFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.STAKING_REWARDS));
  gTokenFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, METRIC.LP_FEES));
  borrowingFee.forEach((i: any) => dailyFees.add(APE, i.amountCollateral, 'Borrowing Fees'));

  govFee.forEach((i: any) => dailyRevenue.add(APE, i.amountCollateral, METRIC.PROTOCOL_FEES));
  stakingFee.forEach((i: any) => dailyRevenue.add(APE, i.amountCollateral, METRIC.STAKING_REWARDS));

  stakingFee.forEach((i: any) => dailyHoldersRevenue.add(APE, i.amountCollateral, METRIC.STAKING_REWARDS));

  gTokenFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral, METRIC.LP_FEES));
  referralFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral, 'Referral Fees'));
  triggerFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral, METRIC.OPERATORS_FEES));
  borrowingFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral, 'Borrowing Fees'));

  return {
    timestamp,
    dailyVolume: volumeLimitsAndMarkets + volumePartials,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: "2023-05-25" },
    [CHAIN.POLYGON]: { fetch, start: "2023-05-25" },
    [CHAIN.BASE]: { fetch, start: "2024-09-26" },
    [CHAIN.APECHAIN]: {
      fetch: fetchApechain,
      start: "2024-11-19",
    },
    [CHAIN.MEGAETH]: { fetch, start: "2026-02-09" },
  },
  prefetch,
  isExpensiveAdapter: true,
  methodology: {
    Volume: 'Notional trading volume from perpetual trades on gTrade.',
    Fees: 'All trading fees paid by users including opening/closing fees, borrowing fees, referral fees, and bot fees.',
    Revenue: 'Fees going to the protocol treasury and GNS token stakers.',
    SupplySideRevenue: 'Fees going to gToken vault LPs, referrers, trigger bots, and borrowing fee recipients.',
    HoldersRevenue: 'Fees distributed to GNS token stakers.',
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
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Share of fees going to protocol treasury and development fund",
      [METRIC.STAKING_REWARDS]: "Share of fees distributed to GNS token stakers",
    },
    HoldersRevenue: {
      [METRIC.STAKING_REWARDS]: "Fees distributed to GNS token stakers",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Fees distributed to gToken vault depositors",
      'Referral Fees': "Fees distributed to referrers",
      [METRIC.OPERATORS_FEES]: "Fees distributed to trigger bots",
      'Borrowing Fees': "Borrowing fees distributed to liquidity providers",
    },
  },
};

export default adapter;
