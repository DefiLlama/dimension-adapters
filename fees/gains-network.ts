import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune, queryDuneSql } from "../helpers/dune";

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
const requests: any = {};

export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const key = `${url}-${start}`;
  if (!requests[key])
    // https://dune.com/queries/4192496
    requests[key] = queryDuneSql(options, `select
        *
      from
        dune.gains.result_g_trade_stats_defi_llama
      where
        day >= from_unixtime(${start})
        and day < from_unixtime(${end})`);
  return requests[key];
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const stats: IStats[] = await fetchURLWithRetry("4192496", options);
  const chainStat = stats.find((stat) => stat.unix_ts === options.startOfDay && stat.blockchain === options.chain);
  const [dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue, totalFees] = chainStat
    ? [
        chainStat.all_fees,
        chainStat.dev_fund + chainStat.project_fund + chainStat.gns_stakers,
        chainStat.gns_stakers,
        chainStat.dai_stakers + chainStat.usdc_stakers + chainStat.weth_stakers,
        chainStat.cumul_fees,
      ]
    : [0, 0, 0, 0, 0];

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    totalFees,
  };
};

const fetchApechain = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
  // Dune does not currently support Apechain. Using events until support is added.
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const DIAMOND = "0x2BE5D7058AdBa14Bc38E4A83E94A81f7491b0163";
  const APE = "0x48b62137edfa95a428d35c09e44256a739f6b557"; // wAPE

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

  [govFee, referralFee, triggerFee, stakingFee, gTokenFee, borrowingFee].flat().forEach((i: any) => dailyFees.add(APE, i.amountCollateral));
  [govFee, stakingFee].flat().forEach((i: any) => dailyRevenue.add(APE, i.amountCollateral));
  stakingFee.forEach((i: any) => dailyHoldersRevenue.add(APE, i.amountCollateral));
  gTokenFee.forEach((i: any) => dailySupplySideRevenue.add(APE, i.amountCollateral));

  return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: "2022-06-03",
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: "2022-12-30",
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: "2024-09-26",
    },
    [CHAIN.APECHAIN]: {
      fetch: fetchApechain,
      start: "2024-11-19",
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
