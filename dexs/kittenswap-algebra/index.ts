import { CHAIN } from "../../helpers/chains";
import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { filterPools } from "../../helpers/uniswap";
import { ethers } from "ethers";
import { addOneToken } from "../../helpers/prices";

const poolEvent = "event Pool(address indexed token0, address indexed token1, address pool)";
const customPoolEvent = "event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool)";
const poolSwapEvent = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
// emitted immediately before each Swap, carrying the fee actually charged on it
const swapFeeEvent = "event SwapFee(address indexed sender, uint24 overrideFee, uint24 pluginFee)";

// AlgebraFactory: purrsec.com/address/0x5f95E92c338e6453111Fc55ee66D4AafccE661A7
const factory = "0x5f95E92c338e6453111Fc55ee66D4AafccE661A7";
// the factory's first Pool event, 2025-08-15
const fromBlock = 11198369;
// Voter, the communityFeeReceiver of gauged pools, which forwards their fees to veKITTEN voters.
// Pools pointing anywhere else pay the treasury multisig instead, so their share is protocol revenue.
const voter = "0xb7f7053f7e6c210e6777d5ba758e4b3eca6c88a0";

// Algebra Integral holds both as private constants, so they cannot be read on-chain
const COMMUNITY_FEE_DENOMINATOR = 1000; // globalState().communityFee, out of 1000
const ALGEBRA_FEE_DENOMINATOR = 1000; // AlgebraCommunityVault.algebraFee, out of 1000

const abis = {
  fee: "function fee() view returns (uint16)",
  globalState: "function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
  communityVault: "function communityVault() view returns (address)",
  algebraFee: "function algebraFee() view returns (uint16)",
  communityFeeReceiver: "function communityFeeReceiver() view returns (address)",
};

const logIndexOf = (log: any) => Number(log.logIndex ?? log.index);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // pools are deployed through two paths and each has its own factory event
  const [poolLogs, customPoolLogs] = await Promise.all([
    getLogs({ target: factory, eventAbi: poolEvent, cacheInCloud: true, fromBlock, entireLog: true }),
    getLogs({ target: factory, eventAbi: customPoolEvent, cacheInCloud: true, fromBlock, entireLog: true }),
  ]);

  const factoryIface = new ethers.Interface([poolEvent, customPoolEvent]);
  const pairObject: IJSON<string[]> = {};
  [...poolLogs, ...customPoolLogs].forEach((log: any) => {
    const { token0, token1, pool } = factoryIface.parseLog(log)?.args as any;
    pairObject[pool] = [token0, token1];
  });

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  const pools = Object.keys(filteredPairs);

  if (!pools.length)
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };

  const [fees, globalStates, vaults] = await Promise.all([
    api.multiCall({ abi: abis.fee, calls: pools, permitFailure: true }),
    api.multiCall({ abi: abis.globalState, calls: pools, permitFailure: true }),
    api.multiCall({ abi: abis.communityVault, calls: pools, permitFailure: true }),
  ]);

  const vaultList = [...new Set(vaults.filter((i: any) => i))] as string[];
  const [algebraFees, receivers] = await Promise.all([
    api.multiCall({ abi: abis.algebraFee, calls: vaultList, permitFailure: true }),
    api.multiCall({ abi: abis.communityFeeReceiver, calls: vaultList, permitFailure: true }),
  ]);
  const vaultInfo: IJSON<{ algebraFee: number, toVoter: boolean }> = {};
  vaultList.forEach((vault, i) => {
    if (algebraFees[i] == null || receivers[i] == null) return;
    vaultInfo[vault] = { algebraFee: Number(algebraFees[i]), toVoter: receivers[i].toLowerCase() === voter };
  });

  // each pool splits its swap fee differently, so a pool we cannot read is skipped rather than guessed at
  const poolInfo: IJSON<{ token0: string, token1: string, fee: number, communityFee: number, algebraFee: number, toVoter: boolean }> = {};
  pools.forEach((pool, i) => {
    const vault = vaults[i] && vaultInfo[vaults[i]];
    if (fees[i] == null || globalStates[i] == null || !vault) return;
    const [token0, token1] = pairObject[pool];
    poolInfo[pool.toLowerCase()] = {
      token0,
      token1,
      fee: Number(fees[i]),
      communityFee: Number(globalStates[i].communityFee),
      algebraFee: vault.algebraFee,
      toVoter: vault.toVoter,
    };
  });
  const skipped = pools.length - Object.keys(poolInfo).length;
  if (skipped) api.log(`kittenswap-algebra: skipped ${skipped}/${pools.length} pools with unreadable fee config`);

  const [swapLogs, swapFeeLogs] = await Promise.all([
    getLogs({ targets: pools, eventAbi: poolSwapEvent, entireLog: true }),
    getLogs({ targets: pools, eventAbi: swapFeeEvent, entireLog: true }),
  ]);
  if (swapLogs.length && !swapFeeLogs.length)
    throw new Error(`kittenswap-algebra: ${swapLogs.length} swaps but no SwapFee logs, the per-swap fee source is broken`);

  const swapFeeIface = new ethers.Interface([swapFeeEvent]);
  const swapFees: IJSON<{ overrideFee: number, pluginFee: number }> = {};
  swapFeeLogs.forEach((log: any) => {
    const { overrideFee, pluginFee } = swapFeeIface.parseLog(log)!.args;
    swapFees[`${log.transactionHash}-${logIndexOf(log) + 1}`] = { overrideFee: Number(overrideFee), pluginFee: Number(pluginFee) };
  });

  const swapIface = new ethers.Interface([poolSwapEvent]);
  swapLogs.forEach((log: any) => {
    const info = poolInfo[(log.address || log.source).toLowerCase()];
    if (!info) return;
    const { amount0, amount1 } = swapIface.parseLog(log)!.args;
    const { token0, token1, communityFee, algebraFee, toVoter } = info;

    const { token, amount } = addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });
    // pools run Algebra's adaptive fee, so the rate the swap actually paid comes from its SwapFee log.
    // a zero overrideFee means the pool's own fee applied, not a free swap
    const swapFeeLog = swapFees[`${log.transactionHash}-${logIndexOf(log)}`];
    const rate = swapFeeLog ? (swapFeeLog.overrideFee || info.fee) + swapFeeLog.pluginFee : info.fee;

    const swapFee = amount * rate / 1e6;
    const toVault = swapFee * communityFee / COMMUNITY_FEE_DENOMINATOR;
    const toAlgebra = toVault * algebraFee / ALGEBRA_FEE_DENOMINATOR;
    const toReceiver = toVault - toAlgebra;
    const destination = toVoter ? 'Swap Fees To veKITTEN Voters' : 'Swap Fees To Treasury';

    dailyFees.add(token, swapFee, 'Swap Fees');
    dailySupplySideRevenue.add(token, swapFee - toVault, 'Swap Fees To LPs');
    dailySupplySideRevenue.add(token, toAlgebra, 'Swap Fees To Algebra');
    dailyRevenue.add(token, toReceiver, destination);
    if (toVoter) dailyHoldersRevenue.add(token, toReceiver, destination);
    else dailyProtocolRevenue.add(token, toReceiver, destination);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Volume: "Value swapped across every Kittenswap Algebra pool, counting one side of each trade.",
  Fees: "Swap fees paid by traders. The rate floats with market volatility, so each trade is charged the exact rate it paid rather than an average.",
  UserFees: "Swap fees paid by traders.",
  SupplySideRevenue: "The share of swap fees kept by liquidity providers, plus the 1.5% cut Algebra takes for licensing the AMM. Gauged pools pass all of their fees on to voters, so their liquidity providers earn nothing here and are paid in KITTEN emissions instead.",
  Revenue: "Swap fees left after liquidity providers and Algebra are paid.",
  ProtocolRevenue: "The share of fees from pools without a gauge that goes to the Kittenswap treasury multisig.",
  HoldersRevenue: "The share of fees from gauged pools that is handed to veKITTEN holders who voted for them.",
};

const breakdownMethodology = {
  Fees: {
    'Swap Fees': "Every swap fee charged, at the rate the trade actually paid.",
  },
  SupplySideRevenue: {
    'Swap Fees To LPs': "What liquidity providers keep. Gauged pools keep nothing; the rest keep 92.5% to 100%.",
    'Swap Fees To Algebra': "Algebra's 1.5% licensing cut, taken out of the fees a pool sends to its vault.",
  },
  Revenue: {
    'Swap Fees To veKITTEN Voters': "Fees from gauged pools, forwarded to the voters backing them.",
    'Swap Fees To Treasury': "Fees from pools without a gauge, forwarded to the Kittenswap treasury multisig.",
  },
  ProtocolRevenue: {
    'Swap Fees To Treasury': "Fees from pools without a gauge, forwarded to the Kittenswap treasury multisig.",
  },
  HoldersRevenue: {
    'Swap Fees To veKITTEN Voters': "Fees from gauged pools, forwarded to the voters backing them.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-08-15',
  methodology,
  breakdownMethodology,
};

export default adapter;
