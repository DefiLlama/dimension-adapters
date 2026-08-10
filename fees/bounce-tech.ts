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
    }),
    feeHandler !== '0x0000000000000000000000000000000000000000'
      ? options.getLogs({
          target: feeHandler,
          eventAbi: 'event HandleFees(address indexed sender, uint256 amount)',
        })
      : Promise.resolve([]),
    referrals !== '0x0000000000000000000000000000000000000000'
      ? options.getLogs({
          target: referrals,
          eventAbi: 'event DonateRebate(address indexed sender, address indexed to, uint256 feeAmount, uint256 referrerRebate, uint256 refereeRebate)',
        })
      : Promise.resolve([]),
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  treasuryLogs.forEach((log: any) => {
    dailyFees.add(baseAsset, log.amount, 'Streaming and Redemption Fees');
    dailyRevenue.add(baseAsset, log.amount, 'Streaming and Redemption Fees To Treasury');
  });

  feeHandlerLogs.forEach((log: any) => {
    dailyFees.add(baseAsset, log.amount, 'Streaming and Redemption Fees');
    dailyRevenue.add(baseAsset, log.amount, 'Streaming and Redemption Fees To Fee Handler');
  });

  rebateLogs.forEach((log: any) => {
    const total = BigInt(log.referrerRebate) + BigInt(log.refereeRebate);
    dailyFees.add(baseAsset, total, 'Streaming and Redemption Fees');
    dailySupplySideRevenue.add(baseAsset, total, 'Streaming and Redemption Fees To Referrers and Referees');
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'All fees charged to users.',
  SupplySideRevenue: 'Referral rebates returned to referrers and referees.',
  Revenue: 'Fees retained by the protocol after referral rebates.',
  ProtocolRevenue: 'Fees retained by the protocol after referral rebates.',
};

const breakdownMethodology = {
  Fees: {
    'Streaming and Redemption Fees': 'Time-based streaming fees and per-redemption fees charged across all leveraged tokens.',
  },
  SupplySideRevenue: {
    'Streaming and Redemption Fees To Referrers and Referees': 'Portion of streaming and redemption fees rebated to referrers and referees.',
  },
  Revenue: {
    'Streaming and Redemption Fees To Treasury': 'Streaming and redemption fees allocated to the Bounce treasury.',
    'Streaming and Redemption Fees To Fee Handler': 'Streaming and redemption fees allocated to the Bounce fee handler.',
  },
  ProtocolRevenue: {
    'Streaming and Redemption Fees To Treasury': 'Streaming and redemption fees allocated to the Bounce treasury.',
    'Streaming and Redemption Fees To Fee Handler': 'Streaming and redemption fees allocated to the Bounce fee handler.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2026-01-28',
  chains: [CHAIN.HYPERLIQUID],
  methodology,
  breakdownMethodology,
};

export default adapter;
