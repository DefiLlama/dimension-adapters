// Bounce - Leveraged Tokens on HyperEVM
//
// Fee accounting:
//   dailyFees              = treasury + feeHandler + rebates
//   dailySupplySideRevenue = rebates
//   dailyRevenue           = treasury + feeHandler
//
// Contract resolution chain:
//   GlobalStorage.factory()    → Factory address
//   GlobalStorage.baseAsset()  → Base asset address
//   GlobalStorage.feeHandler() → FeeHandler address
//   GlobalStorage.referrals()  → Referrals address
//   Factory.lts()              → All deployed LeveragedToken addresses

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';

const fetch = async (options: FetchOptions) => {
  const [factory, baseAsset, feeHandler, referrals] = await Promise.all([
    options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE }),
    options.api.call({ abi: 'address:baseAsset', target: GLOBAL_STORAGE }),
    options.api.call({ abi: 'address:feeHandler', target: GLOBAL_STORAGE }),
    options.api.call({ abi: 'address:referrals', target: GLOBAL_STORAGE }),
  ]);

  const lts: string[] = await options.api.call({ abi: 'address[]:lts', target: factory });

  const [treasuryLogs, feeHandlerLogs, rebateLogs] = await Promise.all([
    options.getLogs({
      targets: lts,
      eventAbi: 'event SendFeesToTreasury(uint256 amount)',
      flatten: true,
    }),
    feeHandler !== '0x0000000000000000000000000000000000000000'
      ? options.getLogs({
          target: feeHandler,
          eventAbi: 'event HandleFees(address indexed sender, uint256 amount)',
          flatten: true,
        })
      : Promise.resolve([]),
    options.getLogs({
      target: referrals,
      eventAbi: 'event DonateRebate(address indexed sender, address indexed to, uint256 feeAmount, uint256 referrerRebate, uint256 refereeRebate)',
      flatten: true,
    }),
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  treasuryLogs.forEach((log: any) => {
    dailyFees.add(baseAsset, log.amount, 'Fees To Treasury');
    dailyRevenue.add(baseAsset, log.amount, 'Fees To Treasury');
  });

  feeHandlerLogs.forEach((log: any) => {
    dailyFees.add(baseAsset, log.amount, 'Fees To Fee Handler');
    dailyRevenue.add(baseAsset, log.amount, 'Fees To Fee Handler');
  });

  rebateLogs.forEach((log: any) => {
    const total = BigInt(log.referrerRebate) + BigInt(log.refereeRebate);
    dailyFees.add(baseAsset, total, 'Referral Rebates');
    dailySupplySideRevenue.add(baseAsset, total, 'Referral Rebates');
  });

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'All fees charged to users',
  SupplySideRevenue: 'Referral rebates returned to referrers and referees.',
  Revenue: 'Fees retained by the protocol after referral rebates.',
};

const breakdownMethodology = {
  Fees: {
    'Fees To Treasury': 'Streaming and redemption fees allocated to the Bounce treasury.',
    'Fees To Fee Handler': 'Streaming and redemption fees allocated to the Bounce fee handler.',
    'Referral Rebates': 'Portion of redemption fees rebated to referrers and referees.',
  },
  SupplySideRevenue: {
    'Referral Rebates': 'Portion of redemption fees rebated to referrers and referees.',
  },
  Revenue: {
    'Fees To Treasury': 'Streaming and redemption fees allocated to the Bounce treasury.',
    'Fees To Fee Handler': 'Streaming and redemption fees allocated to the Bounce fee handler.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2026-01-28',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
