import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { forEachKadenaBlock, kadenaNumber } from "../../helpers/kadena";

// Kaddex (later eckoDEX, now run by the community as Mercatus) is a constant-product AMM on Kadena chain 2.
// Stats API used by the Mercatus app itself: https://www.mercatus.works/analytics
// If the API fails, the same volume is read from the exchange's SWAP events on chain.
const API = 'https://dexapi.kadena.fun';
const EXCHANGE_CHAIN_ID = 2;
const EXCHANGE_NAMESPACE = 'kaddex';
const EXCHANGE_MODULE = 'exchange';

// kaddex.exchange module: FEE 0.003 on every swap, of which FEE_RESERVED 0.0005 is minted to the
// pair's fee account for the KDX staking program, the rest stays in the pool for liquidity providers.
const SWAP_FEE = 0.003;
const STAKING_FEE = 0.0005;
const LP_FEES = 'Swap Fees To LPs';
const STAKING_FEES = 'Swap Fees To KDX Stakers';

// native KDA is the `coin` contract, which has no namespace
const isKda = (namespace: any, name: any) => name === 'coin' && (namespace === null || namespace === undefined);

const toAmount = (value: any, field: string, day: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`kaddex: bad ${field} ${JSON.stringify(value)} on ${day}`);
  return value;
};

// every pool is paired with KDA, so each swap leg has KDA on one side and is counted once, in KDA
const getVolumeFromApi = async (day: string): Promise<number> => {
  const response = await httpGet(`${API}/volume/daily?dateStart=${day}&dateEnd=${day}`);
  if (!Array.isArray(response)) throw new Error(`kaddex: unexpected volume response for ${day}`);
  const entries = response.filter((item: any) => item._id === day);
  if (entries.length > 1) throw new Error(`kaddex: ${entries.length} volume entries for ${day}`);

  let volumeInKda = 0;
  for (const swap of entries[0]?.volumes ?? []) {
    if (isKda(swap.tokenFromNamespace, swap.tokenFromName)) volumeInKda += toAmount(swap.tokenFromVolume, 'tokenFromVolume', day);
    else if (isKda(swap.tokenToNamespace, swap.tokenToName)) volumeInKda += toAmount(swap.tokenToVolume, 'tokenToVolume', day);
    else throw new Error(`kaddex: swap volume between ${swap.tokenFromName} and ${swap.tokenToName} on ${day} has no KDA side to value it with`);
  }
  return volumeInKda;
};

// Same number read from the chain: the exchange emits one SWAP event per pool a trade goes through,
// with params [sender, receiver, amount in, token in, amount out, token out].
const getVolumeOnChain = async (options: FetchOptions): Promise<number> => {
  let volumeInKda = 0;
  await forEachKadenaBlock(options, (block) => {
    const where = `chain ${block.chainId} block ${block.height}`;
    for (const { output } of block.transactions) {
      for (const event of output.events ?? []) {
        if (event.name !== 'SWAP' || event.module?.namespace !== EXCHANGE_NAMESPACE || event.module?.name !== EXCHANGE_MODULE) continue;
        const [, , amountIn, tokenIn, amountOut, tokenOut] = event.params;
        if (isKda(tokenIn?.refName?.namespace, tokenIn?.refName?.name)) volumeInKda += kadenaNumber(amountIn, 'swap amount in', where);
        else if (isKda(tokenOut?.refName?.namespace, tokenOut?.refName?.name)) volumeInKda += kadenaNumber(amountOut, 'swap amount out', where);
        else throw new Error(`kaddex: swap between ${tokenIn?.refName?.name} and ${tokenOut?.refName?.name} in ${where} has no KDA side to value it with`);
      }
    }
  }, [EXCHANGE_CHAIN_ID]);
  return volumeInKda;
};

const fetch = async (options: FetchOptions) => {
  const day = options.dateString;
  let volumeInKda: number;
  try {
    volumeInKda = await getVolumeFromApi(day);
  } catch (e: any) {
    console.error(`kaddex: stats api failed for ${day} (${e?.message ?? e}), reading swaps from the chain instead`);
    volumeInKda = await getVolumeOnChain(options);
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyVolume.addCGToken('kadena', volumeInKda);
  dailySupplySideRevenue.addCGToken('kadena', volumeInKda * (SWAP_FEE - STAKING_FEE), LP_FEES);
  dailyHoldersRevenue.addCGToken('kadena', volumeInKda * STAKING_FEE, STAKING_FEES);
  dailyFees.addBalances(dailySupplySideRevenue);
  dailyFees.addBalances(dailyHoldersRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyHoldersRevenue.clone(),
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.KADENA],
  start: '2022-08-01',
  methodology: {
    Volume: 'Swap volume on all Kaddex (Mercatus) pools, taken from the KDA side of each swap.',
    Fees: 'Swaps pay a 0.3% fee.',
    UserFees: 'Swaps pay a 0.3% fee.',
    Revenue: '0.05% of every swap is reserved by the exchange for the KDX staking program.',
    ProtocolRevenue: 'No part of the swap fee goes to a treasury.',
    HoldersRevenue: '0.05% of every swap goes to KDX stakers.',
    SupplySideRevenue: '0.25% of every swap stays in the pool for liquidity providers.',
  },
  breakdownMethodology: {
    Fees: {
      [LP_FEES]: '0.25% of swap volume, kept in the pools',
      [STAKING_FEES]: '0.05% of swap volume, reserved for the KDX staking program',
    },
    Revenue: {
      [STAKING_FEES]: '0.05% of swap volume, reserved for the KDX staking program',
    },
    HoldersRevenue: {
      [STAKING_FEES]: '0.05% of swap volume, reserved for the KDX staking program',
    },
    SupplySideRevenue: {
      [LP_FEES]: '0.25% of swap volume, kept in the pools',
    },
  },
};

export default adapter;
