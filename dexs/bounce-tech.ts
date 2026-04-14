// Bounce - Leveraged Tokens on HyperEVM
//
// Volume = notional base asset exposure based on mints and redemptions.
//   notional = baseAmount × targetLeverage
//
//   Mint event:          baseAmount = Base asset amount deposited by user
//   Redeem event:        baseAmount = Base asset amount withdrawn by user (after fees, instant)
//   ExecuteRedeem event: baseAmount = Base asset amount withdrawn by user (after fees, async)
//
// Contract resolution chain:
//   GlobalStorage.factory()         → Factory address
//   GlobalStorage.baseAsset()       → Base asset address
//   Factory.lts()                   → All deployed LeveragedToken addresses
//   LeveragedToken.targetLeverage() → Leverage per token (1e18 scale)

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  try {
    const factory: string = await options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE });

    // baseAsset is independent of lts; fetch both in parallel now that factory is known
    const [baseAsset, lts]: [string, string[]] = await Promise.all([
      options.api.call({ abi: 'address:baseAsset', target: GLOBAL_STORAGE }),
      options.api.call({ abi: 'address[]:lts', target: factory }),
    ]);

    const [leverages, logsPerLt] = await Promise.all([
      options.api.multiCall({ abi: 'uint256:targetLeverage', calls: lts }),
      // Query per-LT so we know which token each log came from
      Promise.all(lts.map(lt => Promise.all([
        options.getLogs({ target: lt, eventAbi: 'event Mint(address indexed minter, address indexed to, uint256 baseAmount, uint256 ltAmount)' }),
        options.getLogs({ target: lt, eventAbi: 'event Redeem(address indexed sender, address indexed to, uint256 ltAmount, uint256 baseAmount)' }),
        options.getLogs({ target: lt, eventAbi: 'event ExecuteRedeem(address indexed user, uint256 ltAmount, uint256 baseAmount)' }),
      ]))),
    ]);

    lts.forEach((lt, i) => {
      const leverage = BigInt(leverages[i]);
      const [mintLogs, redeemLogs, executeRedeemLogs] = logsPerLt[i];

      const addNotional = (log: any, label: string) => {
        const notional = BigInt(log.baseAmount) * leverage / 10n ** 18n;
        dailyVolume.add(baseAsset, notional, label);
      };

      mintLogs.forEach((log: any) => addNotional(log, 'Mint'));
      redeemLogs.forEach((log: any) => addNotional(log, 'Redeem'));
      executeRedeemLogs.forEach((log: any) => addNotional(log, 'Redeem'));
    });

    return { dailyVolume };
  } catch (e) {
    console.error('bounce-tech fetch error:', e);
    return { dailyVolume };
  }
};

const methodology = {
  Volume: 'Notional leveraged exposure created and destroyed via mints and redemptions. Calculated as base asset amount × target leverage per token.',
};

const breakdownMethodology = {
  Volume: {
    'Mint': 'Notional exposure created when users mint leveraged tokens.',
    'Redeem': 'Notional exposure destroyed when users redeem leveraged tokens (instant and async).',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
