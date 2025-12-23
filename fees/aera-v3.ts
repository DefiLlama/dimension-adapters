import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const config: any = {
  [CHAIN.ETHEREUM]: {
    multiDepositorVaultFactory: {
      address: '0x29722cC9a1cACff4a15914F9bC274B46F3b90B4F',
      fromBlock: 22583788,
    },
    singleDepositorVaultFactory: {
      address: '0x8f1FdB45160234d6E7e3653F5Af8e09A2Ce25AEb',
      fromBlock: 22584116,
    },
  },
  [CHAIN.BASE]: {
    multiDepositorVaultFactory: {
      address: '0x29722cC9a1cACff4a15914F9bC274B46F3b90B4F',
      fromBlock: 30834355,
    },
    singleDepositorVaultFactory: {
      address: '0x8f1FdB45160234d6E7e3653F5Af8e09A2Ce25AEb',
      fromBlock: 30834356,
    },
  },
};

const abis = {
  multiDepositorVaultCreated:
    'event VaultCreated(address indexed vault, address indexed owner, address hooks, (string name, string symbol) erc20Params, (address feeCalculator, address feeToken, address feeRecipient) feeVaultParams, address beforeTransferHook, string description)',
  singleDepositorVaultCreated:
    'event VaultCreated(address indexed vault, address indexed owner, address submitHooks, address feeToken, address feeCalculator, address feeRecipient, string description)',
  totalSupply: 'function totalSupply() view returns (uint256)',
  decimals: 'function decimals() view returns (uint8)',
  feeCalculator: 'function feeCalculator() view returns (address)',
  numeraire: 'function NUMERAIRE() view returns (address)',
  getVaultState:
    'function getVaultState(address vault) external view returns ((bool paused, uint8 maxPriceAge, uint16 minUpdateIntervalMinutes, uint16 maxPriceToleranceRatio, uint16 minPriceToleranceRatio, uint8 maxUpdateDelayDays, uint32 timestamp, uint24 accrualLag, uint128 unitPrice, uint128 highestPrice, uint128 lastTotalSupply))',
};

const PROTOCOL_FEE_RATIO = 0.2; // 20% of positive yield

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, getLogs, fromApi, toApi } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const chainConfig = config[chain];

  const [multiDepositorVaultLogs, singleDepositorVaultLogs] = await Promise.all(
    [
      getLogs({
        target: chainConfig.multiDepositorVaultFactory.address,
        eventAbi: abis.multiDepositorVaultCreated,
        fromBlock: chainConfig.multiDepositorVaultFactory.fromBlock,
        cacheInCloud: true,
      }),
      getLogs({
        target: chainConfig.singleDepositorVaultFactory.address,
        eventAbi: abis.singleDepositorVaultCreated,
        fromBlock: chainConfig.singleDepositorVaultFactory.fromBlock,
        cacheInCloud: true,
      }),
    ]
  );

  const vaults: string[] = [];
  multiDepositorVaultLogs.forEach((log: any) => vaults.push(log.vault));
  singleDepositorVaultLogs.forEach((log: any) => vaults.push(log.vault));

  if (!vaults.length) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  }

  const [totalSupplies, decimalsArray, feeCalculators] = await Promise.all([
    fromApi.multiCall({
      abi: abis.totalSupply,
      calls: vaults,
      permitFailure: true,
    }),
    fromApi.multiCall({
      abi: abis.decimals,
      calls: vaults,
      permitFailure: true,
    }),
    fromApi.multiCall({
      abi: abis.feeCalculator,
      calls: vaults,
      permitFailure: true,
    }),
  ]);

  const [numeraireTokens, vaultStatesStart, vaultStatesEnd] = await Promise.all(
    [
      fromApi.multiCall({
        abi: abis.numeraire,
        calls: feeCalculators.map((fc) => ({ target: fc })),
        permitFailure: true,
      }),
      fromApi.multiCall({
        abi: abis.getVaultState,
        calls: vaults.map((vault, i) => ({
          target: feeCalculators[i],
          params: [vault],
        })),
        permitFailure: true,
      }),
      toApi.multiCall({
        abi: abis.getVaultState,
        calls: vaults.map((vault, i) => ({
          target: feeCalculators[i],
          params: [vault],
        })),
        permitFailure: true,
      }),
    ]
  );

  for (let i = 0; i < vaults.length; i++) {
    const totalSupply = totalSupplies[i];
    const decimals = decimalsArray[i];
    const numeraireToken = numeraireTokens[i];
    const vaultStateStart = vaultStatesStart[i];
    const vaultStateEnd = vaultStatesEnd[i];

    if (
      !totalSupply ||
      !decimals ||
      !numeraireToken ||
      !vaultStateStart ||
      !vaultStateEnd
    ) {
      continue;
    }

    const unitPriceStart = BigInt(vaultStateStart[8]);
    const unitPriceEnd = BigInt(vaultStateEnd[8]);

    const unitPriceDelta = unitPriceEnd - unitPriceStart;
    const yieldAmount =
      (BigInt(totalSupply) * unitPriceDelta) / BigInt(10 ** decimals);

    // Only track positive yield (negative yield/losses are not reported)
    if (yieldAmount <= 0n) {
      continue;
    }

    dailyFees.add(numeraireToken, yieldAmount);

    const protocolFee =
      (yieldAmount * BigInt(Math.floor(PROTOCOL_FEE_RATIO * 1e18))) /
      BigInt(1e18);
    const guardianFee = yieldAmount - protocolFee;

    dailyProtocolRevenue.add(
      numeraireToken,
      protocolFee,
      METRIC.MANAGEMENT_FEES
    );
    dailyRevenue.add(numeraireToken, protocolFee, METRIC.MANAGEMENT_FEES);

    dailySupplySideRevenue.add(
      numeraireToken,
      guardianFee,
      METRIC.ASSETS_YIELDS
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Yields earned on vault deposits',
    [METRIC.MANAGEMENT_FEES]: 'Management fees occurred on fee-enabled vaults',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fees occurred on fee-enabled vaults',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Yields earned on vault deposits',
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fees occurred on fee-enabled vaults',
  },
};

const methodology = {
  Fees: 'Fees are derived from unitPrice changes only: yield = totalSupply × (unitPriceEnd - unitPriceStart). Deposits and withdrawals do not affect fees. Only positive yield is counted; losses are not reported.',
  Revenue:
    'Protocol management fees (~20% of positive yield) collected by Aera.',
  ProtocolRevenue:
    'Same as Revenue — protocol management fees from vault operations.',
  SupplySideRevenue:
    'Guardian/operator fees (~80% of positive yield) paid to vault managers.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-05-28' },
    [CHAIN.BASE]: { start: '2025-05-28' },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
