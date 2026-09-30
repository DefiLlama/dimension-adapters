// Mercurifi Launchpad (launch.mercuri.finance) - bonding-curve launchpad on Arc. Every trade pays the token's
// immutable fee rate on its USDC side into one FeeManager, so volume is reconstructed from the FeeManager's
// FeeAccrued events at each token's own rate, read from the factory's TokenCreated record. FeeAccrued's
// `source` tells the venues apart: 0 is a trade against a bonding curve (this adapter), 1 is a swap in a
// graduated token's Uniswap v4 pool (dexs/mercurifi-dex). Source (verified on the explorer, full match on
// Sourcify): https://github.com/mercuri-finance/mercuri-launch-contracts
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FEE_MANAGER = "0x31d1bfe59b783f4c077f853f962d1355afb52580";
const FACTORY = "0x8f5dfa0c48e14ccd03ae01795b8a95759ba859eb";
// LaunchFactory's deployment block: the first launch cannot predate it.
const FACTORY_BLOCK = 22060881;

// The factory announces each launch with the config the token keeps for life, including its fee rate.
const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, address deployer, string name, string symbol, string metadataURI, bytes32 configHash, tuple(uint256 virtualUsdc, uint256 virtualTokens, uint256 curveSupply, uint256 poolSupply, uint256 launchFee, uint256 maxInitialBuyTokens, uint16 tradeFeeBps, uint16 creatorShareBps, uint16 referrerShareBps, uint16 snipeStartBps, uint32 snipeBlocks) config)";
// The trade fee, already split. `source` is 0 for a trade against a bonding curve and 1 for a swap in a
// graduated token's Uniswap v4 pool.
const FEE_ACCRUED =
  "event FeeAccrued(address indexed token, address indexed trader, address creator, address referrer, uint256 creatorAmount, uint256 referrerAmount, uint256 platformAmount, uint8 source)";

export const SOURCE_CURVE = 0;
export const SOURCE_POOL = 1;
const BPS = 10_000n;

const lower = (value: any) => String(value).toLowerCase();

// Amounts are native USDC wei (18 decimals): on Arc, USDC is the gas token, so addGasToken prices them.
export const mercurifiVolume = (source: number) => async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Every launch the factory has ever made, for each token's own immutable fee rate. Cached, because it is the
  // same scan every hour.
  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_CREATED,
    fromBlock: FACTORY_BLOCK,
    cacheInCloud: true,
  });
  const feeBpsOfToken = new Map<string, bigint>();
  for (const launch of launches) feeBpsOfToken.set(lower(launch.token), BigInt(launch.config.tradeFeeBps));

  const tradeFeeLogs = await options.getLogs({ target: FEE_MANAGER, eventAbi: FEE_ACCRUED });
  for (const log of tradeFeeLogs) {
    if (Number(log.source) !== source) continue;
    const bps = feeBpsOfToken.get(lower(log.token));
    // Only tokens the factory recorded are trusted, and a zero-rate config would price no volume at all.
    if (!bps) continue;
    const fee = BigInt(log.creatorAmount) + BigInt(log.referrerAmount) + BigInt(log.platformAmount);
    dailyVolume.addGasToken((fee * BPS) / bps);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: mercurifiVolume(SOURCE_CURVE),
  chains: [CHAIN.ARC],
  // Mainnet deployment, block 22060881; matches fees/mercurifi.
  start: "2026-09-21",
  methodology: {
    Volume:
      "The USDC side of every buy and sell against a token's bonding curve (FeeAccrued with source 0), reconstructed from the protocol's fee events at each token's own immutable fee rate (1% at deployment). Swaps in graduated tokens' pools are counted by dexs/mercurifi-dex, not here.",
  },
};

export default adapter;
