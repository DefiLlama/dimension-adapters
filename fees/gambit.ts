import {
  Adapter,
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const events = [
  "event DevGovFeeCharged(address indexed trader, uint valueUsdc)",
  "event SssFeeCharged(address indexed trader, uint valueUsdc)",
  "event ReferralFeeCharged(address indexed trader, uint valueUsdc)",
  "event UsdcVaultFeeCharged(address indexed trader, uint valueUsdc)",
];

// GambitTradingCallbacksV1 address
const FEE_ADDRESS = {
  [CHAIN.ERA]: [
    "0xE95a6FCC476Dc306749c2Ac62fB4637c27ac578d",
    "0x6cf71FaeA3771D56e72c72501e7172e79116E2A3",
    "0x50853A14cD14CC6A891BF034A204A15d294AF056",
    "0x240d75373f9941b8F7FbA660b9ae73dfa655f7Da", // v1.3.4
    "0x43c1cc807Dc22bCF7C789eDE4d1B4828C87A06D1", // v1.5.1
    "0x3bEa4Af64689ce3429D312cf205312842C944DeE", // v1.6.0
  ],
  [CHAIN.ARBITRUM]: [
    "0x8d85f4615ea5F2Ea8D91C196aaD4C04D8416865C",
    "0xB88C3A703B3565cb7bfdB1806Ba3728C54dd4b91", // v1.3.1
    "0x77233F7F6f11300Fd30B338dA38D96a7bFD5aB86", // v1.5.1
    "0xB4099795021506b67ef974eCb85e10898e2F0D45", // v1.6.0
  ],
};

const fetch = (addressList: string[]) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, getLogs, chain }: FetchOptions
  ): Promise<FetchResultFees> => {
    const USDC = (ADDRESSES as any)[chain].USDC;

    const [devFeeVol, ssFeeVol, referralFeeVol, usdcVaultFeeVol]: any =
      await Promise.all(
        events.map(async (e: string) =>
          (
            await getLogs({ targets: addressList, eventAbi: e })
          ).reduce((acc, i) => acc + Number(i.valueUsdc), 0)
        )
      );
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailySupplySideRevenue = createBalances();
    dailyFees.add(USDC, devFeeVol, 'Governance Fees');
    dailyFees.add(USDC, ssFeeVol, 'Staking Fees');
    dailyFees.add(USDC, referralFeeVol, 'Referral Fees');
    dailyFees.add(USDC, usdcVaultFeeVol, 'LP Vault Fees');
    dailyRevenue.add(USDC, devFeeVol, 'Governance Fees');
    dailyRevenue.add(USDC, ssFeeVol, 'Staking Fees');
    dailySupplySideRevenue.add(USDC, referralFeeVol, 'Referral Fees');

    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue,
    } as FetchResultFees;
  };
};

const methodology = {
  Fees: 'All trading fees collected from perpetual trades, including governance, staking, referral, and LP vault fees.',
  Revenue: 'Fees allocated to protocol governance and stakers.',
  HoldersRevenue: 'Fees allocated to protocol governance and stakers.',
  SupplySideRevenue: 'Fees paid to referrers.',
};

const breakdownMethodology = {
  Fees: {
    'Governance Fees': 'Fees charged on trades allocated to protocol governance and development',
    'Staking Fees': 'Fees charged on trades allocated to stakers',
    'Referral Fees': 'Fees charged on trades allocated to referrers',
    'LP Vault Fees': 'Fees charged on trades allocated to USDC vault liquidity providers',
  },
  Revenue: {
    'Governance Fees': 'Fees charged on trades allocated to protocol governance and development',
    'Staking Fees': 'Fees charged on trades allocated to stakers',
  },
  HoldersRevenue: {
    'Governance Fees': 'Fees charged on trades allocated to protocol governance and development',
    'Staking Fees': 'Fees charged on trades allocated to stakers',
  },
  SupplySideRevenue: {
    'Referral Fees': 'Fees charged on trades allocated to referrers',
  },
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch(FEE_ADDRESS[CHAIN.ERA]),
      start: '2023-08-01', // 2023/08/01 00:00:00
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(FEE_ADDRESS[CHAIN.ARBITRUM]),
      start: '2023-11-02', // 2023/11/02 00:00:00
    },
  },
};

export default adapter;
