import { CHAIN } from "../../helpers/chains";
import { Chain, FetchResultVolume, SimpleAdapter, FetchOptions } from '../../adapters/types';
import { BRIDGE, SENT_ABI, tokenFromSourceAddress, getStacksLocks, getSolanaLocks, getNearLocks, getTezosLocks, getStellarLocks, getWavesLocks } from "../../helpers/allbridge";

// Allbridge Classic documents a 0.3% transfer fee; Sent.amount is net of it, so gross volume reverses the fee.
// 1003/1000 is the existing integer approximation used to gross up the 0.3% fee.
// https://docs.allbridge.io
const GROSS_UP_NUM = 1003n;
const GROSS_UP_DENOM = 1000n;

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
  if (options.chain === CHAIN.STACKS) {
    // Stacks source-chain outflow = successful `lock` calls on the bridge
    // (unlock calls are the receive side and must not be counted).
    // The locked amount is what the trader put in, i.e. gross by definition.
    const locks = await getStacksLocks(options.startTimestamp, options.endTimestamp);
    // addCGToken takes whole-token units (not base units): aeUSDC 6dp.
    // Daily legs move thousands at most, far below 2^53, so the division is exact.
    for (const lock of locks) dailyVolume.addCGToken(lock.token, Number(lock.amount) / 10 ** lock.decimals);
    return { dailyVolume };
  }
  if (options.chain === CHAIN.SOLANA) {
    // Solana source-chain outflow = largest inner SPL transfer of each Lock
    // invocation (smaller ones are the fee legs). Whole-token units, as above.
    const locks = await getSolanaLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) dailyVolume.addCGToken(lock.token, Number(lock.amount) / 10 ** lock.decimals);
    return { dailyVolume };
  }
  if (options.chain === CHAIN.NEAR) {
    // Near source-chain outflow = lock amounts from callback_create_lock.
    const locks = await getNearLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) dailyVolume.addCGToken(lock.token, Number(lock.amount) / 10 ** lock.decimals);
    return { dailyVolume };
  }
  if (options.chain === CHAIN.TEZOS) {
    // Tezos outflow dead since 2022 (verified): correctly reports zero.
    // Any future lock throws inside getTezosLocks (unmapped pricing).
    const locks = await getTezosLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) dailyVolume.addCGToken(lock.token, Number(lock.amount) / 10 ** lock.decimals);
    return { dailyVolume };
  }
  if (options.chain === CHAIN.STELLAR) {
    // Stellar source-chain outflow = deposits TO the bridge account.
    const locks = await getStellarLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) dailyVolume.addCGToken(lock.token, Number(lock.amount) / 10 ** lock.decimals);
    return { dailyVolume };
  }
  if (options.chain === CHAIN.WAVES) {
    // Waves source-chain outflow = lock invokes with attached payment.
    const locks = await getWavesLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) dailyVolume.addCGToken(lock.token, Number(lock.amount) / 10 ** lock.decimals);
    return { dailyVolume };
  }
  const logs = await options.getLogs({ target: BRIDGE, eventAbi: SENT_ABI });
  for (const log of logs) {
    // Sent.amount is net of the fee (observed: 4,999 USDC bridged + 1 USDC fee
    // on 0x7a89f9...6642f9), so volume adds the fee back to report gross
    // (dexs rule); kept in integer math, no float dust
    const gross = options.chain === CHAIN.ETHEREUM
      ? log.amount
      : (BigInt(log.amount) * GROSS_UP_NUM) / GROSS_UP_DENOM;
    const token = tokenFromSourceAddress(log.tokenSourceAddress);
    if (token) dailyVolume.add(token, gross);
    else dailyVolume.addGasToken(gross);
  }
  return { dailyVolume };
};

const methodology = {
  Volume: "Bridged amount of every Allbridge Classic transfer on the source chain, read from on-chain Sent events (EVM) and bridge lock calls, deposits and invokes (Stacks, Solana, Near, Tezos, Stellar, Waves).",
};

// On-chain rebuild 2026-10: the legacy stats API (stats.a11bd.net) went dark,
// freezing this series at 2026-08-30. Legs rebuilt from bridge logs (EVM,
// one shared bridge address) and bridge calls/APIs (non-EVM, see below).
// Starts are gap-fill guards (not earliest-data dates): pre-2026-08-30 history
// stays exactly as the legacy API recorded it and must not be recomputed.
// Sunset chains (Terra/Harmony/Heco) commented out: history frozen.
// Every other Classic chain is now live (Waves was the last gap).
// Klaytn/Aurora/Fuse joined 2026-10-15: pool 0xBBbD... verified deployed on
// all three (eth_getCode, public RPCs); same Sent event as the live EVM legs.
// Stacks joined 2026-10-15: lock calls via the public Hiro API.
// Solana joined 2026-10-15: Lock invocations via public RPC, instruction level.
// Stellar joined 2026-10-15: deposits TO the bridge via public Horizon.
// Near joined 2026-10-15: lock callbacks via the public NearBlocks API.
// Tezos joined 2026-10-15: lock_asset via TzKT (outflow dead since 2022).
// Waves joined 2026-10-15: lock invokes via nodes API (dApp found via the
// abUSDC issuer trail; no public doc lists it).
const chains: Chain[] = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.CELO,
  CHAIN.FANTOM,
  CHAIN.STACKS,
  CHAIN.SOLANA,
  CHAIN.NEAR,
  CHAIN.TEZOS,
  CHAIN.KLAYTN,
  CHAIN.AURORA,
  CHAIN.FUSE,
  CHAIN.STELLAR,
  CHAIN.WAVES,
  // [CHAIN.TERRA]: chain sunset; history frozen
  // [CHAIN.HARMONY]: chain sunset; history frozen
  // [CHAIN.HECO]: skipped before too; history frozen
];
const start = '2026-08-30';

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains,
  start,
  methodology,
}

export default adapter;
