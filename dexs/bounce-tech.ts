// Bounce - Leveraged Tokens on HyperEVM
//
// Volume = USDC flow through mint and redeem operations across all LeveragedToken contracts.
//   Mint event:          baseAmount = USDC deposited by user
//   Redeem event:        baseAmount = USDC withdrawn by user (after fees, instant)
//   ExecuteRedeem event: baseAmount = USDC withdrawn by user (after fees, async)
//
// Contract resolution chain:
//   GlobalStorage.factory()   → Factory address
//   GlobalStorage.baseAsset() → Base asset address
//   Factory.lts()             → All deployed LeveragedToken addresses

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';

const fetch = async (options: FetchOptions) => {
  const [factory, baseAsset] = await Promise.all([
    options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE }),
    options.api.call({ abi: 'address:baseAsset', target: GLOBAL_STORAGE }),
  ]);

  const lts: string[] = await options.api.call({ abi: 'address[]:lts', target: factory });

  const [mintLogs, redeemLogs, executeRedeemLogs] = await Promise.all([
    options.getLogs({
      targets: lts,
      eventAbi: 'event Mint(address indexed minter, address indexed to, uint256 baseAmount, uint256 ltAmount)',
      flatten: true,
    }),
    options.getLogs({
      targets: lts,
      eventAbi: 'event Redeem(address indexed sender, address indexed to, uint256 ltAmount, uint256 baseAmount)',
      flatten: true,
    }),
    options.getLogs({
      targets: lts,
      eventAbi: 'event ExecuteRedeem(address indexed user, uint256 ltAmount, uint256 baseAmount)',
      flatten: true,
    }),
  ]);

  const dailyVolume = options.createBalances();

  mintLogs.forEach((log: any) => dailyVolume.add(baseAsset, log.baseAmount));
  redeemLogs.forEach((log: any) => dailyVolume.add(baseAsset, log.baseAmount));
  executeRedeemLogs.forEach((log: any) => dailyVolume.add(baseAsset, log.baseAmount));

  return { dailyVolume };
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
  methodology: {
    Volume: 'Nominal USDC value of mints and redemptions across all Bounce leveraged tokens.',
  },
};

export default adapter;
