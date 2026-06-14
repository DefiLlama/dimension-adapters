import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

// Performance fee on borrower interest only (per-vault rate, read from AccrueInterest on stopEpoch) -> treasury; rest -> depositors. No buyback => no holders revenue. Owns every credit vault.
// the legacy tranches/best-yield stay in fees/idle (same parent: parent#pareto).
// Vaults are IdleCDOEpochVariant proxies, listed in the Pareto API (https://docs.pareto.credit/developers/api)
// and labeled "Pareto: Credit Vault ..." on the explorers.
const config: any = {
  [CHAIN.ETHEREUM]: {
    // IdleCreditVaultFactory, verified on etherscan, deployed at block 22938055.
    // Emits CreditVaultDeployed for every vault created after the four pre-factory vaults below.
    factory: { address: '0x59aabdad8fdabd227cc71543b128765f93906626', fromBlock: 22938055 },
    credits: [
      '0xf6223C567F21E33e859ED7A045773526E9E3c2D5', // Fasanara Yield
      '0x4462eD748B8F7985A4aC6b538Dfc105Fce2dD165', // Bastion
      '0x14B8E918848349D1e71e806a52c13D4e0d3246E0', // Adaptive Frontier
      '0x433D5B175148dA32Ffe1e1A37a939E1b7e79be4d', // FalconX
    ],
  },
  [CHAIN.POLYGON]: {
    credits: ['0xF9E2AE779a7d25cDe46FccC41a27B8A4381d4e52'], // Bastion
  },
  [CHAIN.OPTIMISM]: {
    credits: ['0xD2c0D848aA5AD1a4C12bE89e713E70B73211989B'], // FalconX
  },
  [CHAIN.ARBITRUM]: {
    credits: ['0x3919396Cd445b03E6Bb62995A7a4CB2AC544245D'], // Bastion
  },
};

const abis = {
  creditVaultDeployed: 'event CreditVaultDeployed(address proxy)',
  accrueInterest: 'event AccrueInterest(uint256 interest, uint256 fees)',
  token: 'function token() view returns (address)',
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, getLogs, api } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const { factory, credits = [] } = config[chain];
  const vaults: string[] = [...credits];

  // pick up factory-deployed vaults
  if (factory) {
    const deployed = await getLogs({
      target: factory.address,
      eventAbi: abis.creditVaultDeployed,
      fromBlock: factory.fromBlock,
      cacheInCloud: true,
    });
    deployed.forEach((log: any) => {
      if (!vaults.find((v) => v.toLowerCase() === log.proxy.toLowerCase())) {
        vaults.push(log.proxy);
      }
    });
  }

  // per-vault underlying (AccrueInterest amounts use its decimals); no permitFailure,
  // a vault that cannot resolve token() should fail the run, not silently drop its fees
  const tokens = await api.multiCall({ abi: abis.token, calls: vaults });

  // flatten: false keeps one log array per vault, aligned with tokens[i]
  const logsPerVault = await getLogs({ targets: vaults, eventAbi: abis.accrueInterest, flatten: false });

  logsPerVault.forEach((logs: any[], i) => {
    const token = tokens[i];
    logs.forEach((log) => {
      const interest = BigInt(log.interest.toString());
      const fees = BigInt(log.fees.toString());
      dailyFees.add(token, interest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(token, fees, METRIC.PERFORMANCE_FEES);
      dailyProtocolRevenue.add(token, fees, METRIC.PERFORMANCE_FEES);
      dailySupplySideRevenue.add(token, interest - fees, METRIC.BORROW_INTEREST);
    });
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: 'Interest paid by borrowers across all Pareto credit vaults.',
  Revenue: 'Performance fee charged by the protocol on borrower interest (per-vault rate).',
  ProtocolRevenue: 'Performance fee collected to the Pareto treasury multisig.',
  SupplySideRevenue: 'Borrower interest distributed to credit vault depositors (lenders) after the performance fee.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers on funds drawn from each credit vault.',
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: 'Protocol performance fee on borrower interest.',
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: 'Performance fee sent to the Pareto treasury multisig.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Net borrower interest distributed to vault depositors after the performance fee.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-10-14' },
    [CHAIN.POLYGON]: { start: '2025-03-31' },
    [CHAIN.OPTIMISM]: { start: '2025-01-31' },
    [CHAIN.ARBITRUM]: { start: '2024-12-31' },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
