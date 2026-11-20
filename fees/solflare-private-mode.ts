import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getSolanaReceived } from '../helpers/token';

// Collector FomYB8AVx4mTF3oVxgyuUPKVNAoi1ASnrNQUfDSXpw4 sweeps its private fee notes here every 12h, e.g. 2uK6T3aNgo8GGFWvF6CvLvUqmk3Zpq7FZWZvSeNGGnYeoNP9byyb5rVjRtMuMFEwSHb6n4kGGGkUd4fk7Yg3M3iW
const TREASURY = 'FEhuTmxRaZ6kWqGo56Bqmu4bKMyGC4x8JzQ7nCnkAWgL';
// SOL interface and SPL vault of the Helius privacy program ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW
const PRIVACY_VAULTS = ['CiNmas621VuyofiDSrEPfTXHKrdZuB6jMKECyNiMpLXE', 'CaM8DbtJ2mSecgaHYo9xeT7VSKq7AnaqEUm5p7e5LW4a'];

const LABELS = {
  fees: 'Private Mode Fees',
  treasury: 'Private Mode Fees To Treasury',
};

const fetch = async (options: FetchOptions) => {
  const swept = await getSolanaReceived({ options, target: TREASURY, fromAddresses: PRIVACY_VAULTS });
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addBalances(swept, LABELS.fees);
  dailyRevenue.addBalances(swept, LABELS.treasury);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-11-16',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'Solflare Private Mode charges 0.3% on withdrawals from the private balance and on Private Sends, paid as a private note to its fee collector. Fees are counted when the collector withdraws them to the public treasury; fees it still holds privately are counted once withdrawn.',
    Revenue: 'All Private Mode fees go to the Solflare treasury.',
    ProtocolRevenue: 'All Private Mode fees go to the Solflare treasury.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.fees]: 'Withdrawal and Private Send fees swept from the private fee collector to the Solflare treasury.',
    },
    Revenue: {
      [LABELS.treasury]: 'Withdrawal and Private Send fees received by the Solflare treasury.',
    },
    ProtocolRevenue: {
      [LABELS.treasury]: 'Withdrawal and Private Send fees received by the Solflare treasury.',
    },
  },
};

export default adapter;
