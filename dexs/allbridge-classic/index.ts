import { CHAIN } from "../../helpers/chains";
import { Chain, FetchResultVolume, SimpleAdapter, FetchOptions } from '../../adapters/types';
import { BRIDGE, SENT_ABI, tokenFromSourceAddress } from "../../helpers/allbridge";

// Allbridge Classic documents a 0.3% transfer fee; Sent.amount is net of it, so gross volume reverses the fee.
// 1003/1000 is the existing integer approximation used to gross up the 0.3% fee.
// https://docs.allbridge.io
const GROSS_UP_NUM = 1003n;
const GROSS_UP_DENOM = 1000n;

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
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
  Volume: "Bridged amount of every Allbridge Classic transfer on the source chain, read from on-chain Sent events.",
};

// On-chain rebuild 2026-10: the legacy stats API (stats.a11bd.net) went dark,
// freezing this series at 2026-08-30. EVM legs rebuilt from bridge logs; the
// chains below are the documented EVM set sharing one bridge address.
// Starts are gap-fill guards (not earliest-data dates): pre-2026-08-30 history
// stays exactly as the legacy API recorded it and must not be recomputed.
// Non-EVM legs (Solana/Near/Stacks/Stellar/Tezos/Waves/Klaytn) and sunset
// chains (Terra/Harmony/Heco/Aurora/Fuse) commented out with reasons.
const chains: Chain[] = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.CELO,
  CHAIN.FANTOM,
  // [CHAIN.AURORA]: EVM but no documented fee rate and negligible volume; follow-up
  // [CHAIN.FUSE]: EVM but no documented fee rate and negligible volume; follow-up
  // [CHAIN.SOLANA]: needs Solana program-log parsing (program BBbD1WSjbHKfyE3TSFWF6vx1JV51c8msKSQy4ess6pXp); follow-up
  // [CHAIN.NEAR]: needs Near receipt parsing (bridge.a11bd.near); follow-up
  // [CHAIN.TEZOS]: needs Tezos indexing; follow-up
  // [CHAIN.KLAYTN]: EVM-compatible but archive RPC unreliable; follow-up
  // [CHAIN.WAVES]: needs Waves node API; follow-up
  // [CHAIN.STELLAR]: needs Stellar Horizon API; follow-up
  // [CHAIN.STACKS]: needs Stacks API; follow-up
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
