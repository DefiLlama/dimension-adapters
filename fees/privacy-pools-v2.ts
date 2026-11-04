import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getConfig } from "../helpers/cache";
import providers from "@defillama/sdk/build/providers.json";

// Privacy Pools v2 (0xbow): one multi-asset PoolVault per chain. Deployments (entrypoint, vault, fromBlock)
// come from the ASP feed; pool assets from Entrypoint.AssetConfigurationSet; the yield shares are the
// assets that expose asset(). https://privacy-pools-v2-docs.vercel.app/deployments
//
// Fee flows:
//  - Entrypoint.Deposited: vetting fee (vettingFeeBPS of the deposit, kept by the entrypoint owner; 0 bps today)
//  - PrivacyPoolRelay.Relayed / RelayedBatch: relayer fee carved out of a relayed withdrawal, paid to the relayer
//  - PPRouter.WithdrawnToUnderlying: relayer fee on a yield-share withdrawal, paid in the underlying
//  - RelaySwaps.Executed: relayer fee on a withdraw-and-swap, paid in the (unwrapped) input token
//  - PPYieldToken (ppUSDC/ppUSDT/ppETH): ERC4626 over Aave v3 aTokens, protocol keeps feeBps of the yield
//    (checkpointed on every deposit/withdraw; exchangeRate is net of that fee)
// The relay, router and swap processors all call PoolVault.transact directly, so each withdrawal shows up
// in exactly one of them. They are discovered by event signature (no target) and filtered on the pool's assets.

const ENTRYPOINTS_API = 'https://api-v2.0xbow.io/global/public/entrypoints';
// production contracts were deployed deterministically on 2026-09-01; the feed's fromBlock is the first
// deposit, which comes after the AssetConfigurationSet logs, so it cannot be used as the log start
const DEPLOY_TIMESTAMP = Math.floor(Date.parse('2026-09-01T00:00:00Z') / 1000);
const BPS = 10_000n;
const NATIVE = ADDRESSES.GAS_TOKEN_2;

const METRICS = {
  VETTING_FEES: 'Deposit Vetting Fees',
  RELAYER_FEES: 'Relayer Fees',
  YIELD: 'Aave Yield',
  YIELD_TO_DEPOSITORS: 'Aave Yield To Depositors',
  YIELD_FEE: 'Aave Yield Performance Fee',
}

const abis = {
  assetConfigurationSet: 'event AssetConfigurationSet(address indexed _asset, (bool enabled, uint256 minAmount, uint256 vettingFeeBPS, uint256 maxRelayFee) _config)',
  deposited: 'event Deposited(address indexed _asset, address indexed _depositor, uint256 _value, uint256 _fee)',
  relayed: 'event Relayed(address indexed _asset, address indexed _recipient, uint256 _recipientAmount, address indexed _feeRecipient, uint256 _fee, uint256 _gasFunding)',
  relayedBatch: 'event RelayedBatch(address indexed _asset, address indexed _recipient, uint256 _recipientAmount, address indexed _feeRecipient, uint256 _fee, uint256 _gasFunding, uint256 _count)',
  withdrawnToUnderlying: 'event WithdrawnToUnderlying(address indexed _asset, address indexed _underlying, address indexed _recipient, uint256 _sharesOut, uint256 _underlyingToRecipient, address _feeRecipient, uint256 _feeShares, uint256 _underlyingFee, uint256 _gasFunding)',
  swapExecuted: 'event Executed(address indexed inputToken, address indexed outputToken, uint256 inputAmount, address feeRecipient, uint256 feeAmount)',
  asset: 'address:asset',
  totalSupply: 'uint256:totalSupply',
  feeBps: 'uint256:feeBps',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256 assets)',
}

const chainByChainId: Record<string, string> = {};
Object.entries(providers as Record<string, any>).forEach(([chain, { chainId }]) => { if (chainId) chainByChainId[chainId] = chain });

// public rpcs that cap eth_getLogs at 1000 blocks; the indexer covers the rest
const maxBlockRanges: Record<string, number> = { [CHAIN.CITREA]: 1000 };

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { pools } = await getConfig('privacy-pools-v2/entrypoints', ENTRYPOINTS_API);
  const pool = pools.find((p: any) => chainByChainId[p.chainId] === options.chain);
  if (!pool) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  const { entrypoint, poolVault } = pool;

  // pool assets ever enabled on the entrypoint; the yield shares among them are the ones exposing asset()
  const deployBlock = await options.getBlock(DEPLOY_TIMESTAMP, options.chain, {});
  const configLogs = await options.getLogs({ target: entrypoint, eventAbi: abis.assetConfigurationSet, fromBlock: deployBlock, toBlock: await options.getToBlock(), cacheInCloud: true, maxBlockRange: maxBlockRanges[options.chain] });
  const poolAssets = [...new Set(configLogs.map(log => log._asset.toLowerCase()))];
  const erc20s = poolAssets.filter(a => a !== NATIVE);
  const underlying: (string | null)[] = erc20s.length ? await options.api.multiCall({ abi: abis.asset, calls: erc20s, permitFailure: true }) : [];
  const yieldTokens = erc20s.filter((_, i) => underlying[i]);
  const aTokenOf: Record<string, string> = Object.fromEntries(erc20s.map((t, i) => [t, underlying[i]]).filter(([, a]) => a));
  const assetSet = new Set(poolAssets);
  const yieldSet = new Set(yieldTokens);

  // fees paid in pp yield shares are accumulated per share token and converted to the aToken at the
  // end-of-period exchange rate in one call per token
  const pendingShares: Record<string, { balances: any, amount: bigint, label: string }[]> = {};
  const add = (balances: any, token: string, amount: any, label: string) => {
    const asset = token.toLowerCase();
    if (asset === NATIVE) return balances.addGasToken(amount, label);
    if (yieldSet.has(asset)) {
      pendingShares[asset] = pendingShares[asset] || [];
      pendingShares[asset].push({ balances, amount: BigInt(amount), label });
      return;
    }
    balances.add(token, amount, label);
  }

  const deposits = await options.getLogs({ target: entrypoint, eventAbi: abis.deposited });
  deposits.forEach(log => {
    if (log._fee == 0) return;
    add(dailyFees, log._asset, log._fee, METRICS.VETTING_FEES);
    add(dailyRevenue, log._asset, log._fee, METRICS.VETTING_FEES);
  });

  // processors: PrivacyPoolRelay (Relayed/RelayedBatch), PPRouter (WithdrawnToUnderlying), RelaySwaps (Executed)
  const relayed = await options.getLogs({ noTarget: true, eventAbi: abis.relayed });
  const relayedBatch = await options.getLogs({ noTarget: true, eventAbi: abis.relayedBatch });
  [...relayed, ...relayedBatch].filter(log => assetSet.has(log._asset.toLowerCase())).forEach(log => {
    add(dailyFees, log._asset, log._fee, METRICS.RELAYER_FEES);
    add(dailySupplySideRevenue, log._asset, log._fee, METRICS.RELAYER_FEES);
  });

  if (yieldTokens.length) {
    const withdrawals = await options.getLogs({ noTarget: true, eventAbi: abis.withdrawnToUnderlying });
    withdrawals.filter(log => yieldSet.has(log._asset.toLowerCase())).forEach(log => {
      add(dailyFees, log._underlying, log._underlyingFee, METRICS.RELAYER_FEES);
      add(dailySupplySideRevenue, log._underlying, log._underlyingFee, METRICS.RELAYER_FEES);
    });
  }

  // RelaySwaps emits the (unwrapped) input token, so it cannot be matched on pool assets; match on the
  // vault instead: the swap contract pulls the withdrawal from the pool vault in the same tx
  const swaps = await options.getLogs({ noTarget: true, eventAbi: abis.swapExecuted, entireLog: true });
  const swapTxs = new Set(swaps.map((log: any) => log.transactionHash));
  if (swapTxs.size) {
    const vaultTransacts = await options.getLogs({ target: poolVault, eventAbi: 'event Transacted(uint256[] outputCommitments, uint256[] nullifierHashes, address indexed asset, uint256 withdrawnValue, address indexed caller)', entireLog: true });
    const poolTxs = new Set(vaultTransacts.map((log: any) => log.transactionHash));
    swaps.filter((log: any) => poolTxs.has(log.transactionHash)).forEach((log: any) => {
      add(dailyFees, log.args.inputToken, log.args.feeAmount, METRICS.RELAYER_FEES);
      add(dailySupplySideRevenue, log.args.inputToken, log.args.feeAmount, METRICS.RELAYER_FEES);
    });
  }

  const shareTokens = Object.keys(pendingShares);
  if (shareTokens.length) {
    const totals = shareTokens.map(t => pendingShares[t].reduce((a, e) => a + e.amount, 0n));
    const converted = await options.api.multiCall({
      abi: abis.convertToAssets,
      calls: shareTokens.map((t, i) => ({ target: t, params: [String(totals[i])] })),
    });
    shareTokens.forEach((t, i) => {
      if (totals[i] === 0n) return;
      pendingShares[t].forEach(e => e.balances.add(aTokenOf[t], BigInt(converted[i]) * e.amount / totals[i], e.label));
    });
  }

  // Aave yield on the pp yield shares: exchange-rate growth over the period scaled by share supply.
  // convertToAssets is net of the protocol's feeBps cut of yield, so gross it back up.
  if (yieldTokens.length) {
    const ONE = String(1e18); // pp shares are always 18 decimals
    const calls = yieldTokens.map(t => ({ target: t, params: [ONE] }));
    const rateBefore = await options.fromApi.multiCall({ abi: abis.convertToAssets, calls, permitFailure: true });
    const rateAfter = await options.toApi.multiCall({ abi: abis.convertToAssets, calls });
    const supplies = await options.toApi.multiCall({ abi: abis.totalSupply, calls: yieldTokens });
    const feeBpss = await options.toApi.multiCall({ abi: abis.feeBps, calls: yieldTokens });
    yieldTokens.forEach((t, i) => {
      if (!rateBefore[i]) return; // share token not deployed yet at period start
      const growth = BigInt(rateAfter[i]) - BigInt(rateBefore[i]);
      if (growth <= 0n) return;
      const netYield = growth * BigInt(supplies[i]) / BigInt(ONE);
      const grossYield = netYield * BPS / (BPS - BigInt(feeBpss[i]));
      dailyFees.add(aTokenOf[t], grossYield, METRICS.YIELD);
      dailySupplySideRevenue.add(aTokenOf[t], netYield, METRICS.YIELD_TO_DEPOSITORS);
      dailyRevenue.add(aTokenOf[t], grossYield - netYield, METRICS.YIELD_FEE);
    });
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Deposit vetting fees, relayer fees taken out of relayed withdrawals (plain, yield-share and withdraw-and-swap routes), and the full Aave v3 yield earned on the ppUSDC / ppUSDT / ppETH yield shares.",
  Revenue: "Deposit vetting fees kept by the protocol plus the protocol's feeBps share (20%) of the Aave yield.",
  ProtocolRevenue: "Deposit vetting fees kept by the protocol plus the protocol's feeBps share (20%) of the Aave yield.",
  SupplySideRevenue: "Relayer fees paid to third-party relayers, and the Aave yield passed through to yield-share holders.",
}

const breakdownMethodology = {
  Fees: {
    [METRICS.VETTING_FEES]: "vettingFeeBPS of each deposit, deducted by the Entrypoint before the funds reach the PoolVault (currently 0 bps on every asset).",
    [METRICS.RELAYER_FEES]: "Fee carved out of a withdrawal by the relayer that submits it: PrivacyPoolRelay (plain assets), PPRouter (yield shares unwrapped to the underlying) and RelaySwaps (withdraw-and-swap).",
    [METRICS.YIELD]: "Total Aave v3 interest earned by the aTokens backing the pp yield shares, from exchange-rate growth times share supply, grossed up for the protocol's cut.",
  },
  Revenue: {
    [METRICS.VETTING_FEES]: "Vetting fees retained by the Entrypoint and sweepable by the protocol owner.",
    [METRICS.YIELD_FEE]: "feeBps (20%) of the yield increase on each pp yield share, accrued to the PPYieldToken owner.",
  },
  ProtocolRevenue: {
    [METRICS.VETTING_FEES]: "Vetting fees retained by the Entrypoint and sweepable by the protocol owner.",
    [METRICS.YIELD_FEE]: "feeBps (20%) of the yield increase on each pp yield share, accrued to the PPYieldToken owner.",
  },
  SupplySideRevenue: {
    [METRICS.RELAYER_FEES]: "Relayer fees paid to the third-party relayers that submit private withdrawals.",
    [METRICS.YIELD_TO_DEPOSITORS]: "Aave yield net of the protocol cut, reflected in the pp yield share exchange rate.",
  },
}

// chains currently listed by the ASP feed; all production contracts were deployed 2026-09-01
const chains = [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.OPTIMISM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.ROBINHOOD];

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(chains.map(chain => [chain, { start: '2026-09-15' }])),
  methodology,
  breakdownMethodology,
};

export default adapter;
