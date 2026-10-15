import { SimpleAdapter, FetchOptions } from '../adapters/types';
import { CHAIN } from "../helpers/chains";
import { BRIDGE, SENT_ABI, tokenFromSourceAddress, getStacksLocks, getStacksFeeBp, getSolanaLocks, getNearLocks, getTezosLocks, getStellarLocks, getWavesLocks, getWavesFeeBp } from "../helpers/allbridge";

// Allbridge Classic documents a 0.3% bridge fee; Ethereum transfers use the observed $1 flat fee.
// https://docs.allbridge.io
const FEE_RATE_NUMERATOR = 3n;
const FEE_RATE_DENOMINATOR = 1000n;
const ETH_FLAT_FEE_USD = 1;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.STACKS) {
    // Stacks fee is NOT the documented 0.3%: the on-chain base rate reads
    // 10bp (verified 2026-10-15). Read live, it is governance-settable.
    const bp = await getStacksFeeBp();
    const locks = await getStacksLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) {
      const fee = (lock.amount * bp) / 10000n;
      dailyFees.addCGToken(lock.token, Number(fee) / 10 ** lock.decimals, 'Bridge Fees');
    }
  } else if (options.chain === CHAIN.SOLANA) {
    // Solana fees are OBSERVED fee transfers inside each Lock invocation,
    // not the nominal rate. Whole-token units, as above.
    const locks = await getSolanaLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) {
      if (lock.feeAmount > 0n) dailyFees.addCGToken(lock.feeToken, Number(lock.feeAmount) / 10 ** lock.feeDecimals, 'Bridge Fees');
    }
  } else if (options.chain === CHAIN.NEAR) {
    // Near fees are OBSERVED per-lock fees from callback_create_lock.
    const locks = await getNearLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) {
      if (lock.feeAmount > 0n) dailyFees.addCGToken(lock.token, Number(lock.feeAmount) / 10 ** lock.decimals, 'Bridge Fees');
    }
  } else if (options.chain === CHAIN.TEZOS) {
    // Dead outflow: no locks, no fees. Future locks throw in the helper.
    await getTezosLocks(options.startTimestamp, options.endTimestamp);
  } else if (options.chain === CHAIN.STELLAR) {
    // Stellar 0.3% is the documented Classic rate (docs.allbridge.io
    // bridge-fee); no on-chain rate to read, so nominal like EVM.
    const locks = await getStellarLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) {
      const fee = (lock.amount * 3n) / 1000n;
      dailyFees.addCGToken(lock.token, Number(fee) / 10 ** lock.decimals, 'Bridge Fees');
    }
  } else if (options.chain === CHAIN.WAVES) {
    // Waves fee from the live on-chain base rate (10bp verified 2026-10-15).
    // Edge: per-asset min fees (500000 units) bind only on sub-$500 transfers;
    // Waves traffic is ~zero, so the nominal formula stands with this note.
    const bp = await getWavesFeeBp();
    const locks = await getWavesLocks(options.startTimestamp, options.endTimestamp);
    for (const lock of locks) {
      const fee = (lock.amount * bp) / 10000n;
      dailyFees.addCGToken(lock.token, Number(fee) / 10 ** lock.decimals, 'Bridge Fees');
    }
  } else {
    const logs = await options.getLogs({ target: BRIDGE, eventAbi: SENT_ABI });
    for (const log of logs) {
      if (options.chain === CHAIN.ETHEREUM) {
        dailyFees.addUSDValue(ETH_FLAT_FEE_USD, 'Bridge Fees');
        continue;
      }
      const fee = (BigInt(log.amount) * FEE_RATE_NUMERATOR) / FEE_RATE_DENOMINATOR;
      const token = tokenFromSourceAddress(log.tokenSourceAddress);
      if (token) dailyFees.add(token, fee, 'Bridge Fees');
      else dailyFees.addGasToken(fee, 'Bridge Fees');
    }
  }
  const dailyRevenue = dailyFees.clone(0.2, 'Bridge Fees');
  const dailyProtocolRevenue = dailyRevenue.clone();
  const dailySupplySideRevenue = dailyFees.clone(0.8, 'Bridge Fees');

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Bridge-fee estimate reconstructed on-chain (nominal rate on EVM and Stellar, on-chain base rate on Stacks and Waves, observed fee transfers on Solana and Near); ABR-staker discounts mean actuals read slightly lower, and one observed transfer carried an unexplained side transfer whose fee role is unconfirmed.",
  Revenue: "20% of bridge fees, kept by the protocol.",
  ProtocolRevenue: "20% of bridge fees, kept by the protocol.",
  SupplySideRevenue: "80% of bridge fees, distributed as staking rewards.",
};

const breakdownMethodology = {
  Fees: {
    "Bridge Fees": "Fees charged to users for each cross-chain token transfer on the source chain.",
  },
  Revenue: {
    "Bridge Fees": "20% of bridge fees kept by the protocol.",
  },
  ProtocolRevenue: {
    "Bridge Fees": "20% of bridge fees collected by the protocol treasury.",
  },
  SupplySideRevenue: {
    "Bridge Fees": "80% of bridge fees distributed as rewards to stakers who provide liquidity.",
  },
};

// On-chain rebuild 2026-10: the legacy stats API (stats.a11bd.net) went dark,
// freezing this series at 2026-08-30. Same 9 EVM legs as dexs (pool verified
// deployed on Klaytn/Aurora/Fuse), plus Stacks, Solana, Near, Tezos, Stellar.
// Starts are gap-fill guards (not earliest-data dates): pre-2026-08-30 history
// stays exactly as the legacy API recorded it and must not be recomputed.
// Remaining non-EVM/sunset legs commented out with reasons (see dexs/allbridge-classic).
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
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
  ],
  start: '2026-08-30',
  methodology,
  breakdownMethodology,
}

export default adapter;
