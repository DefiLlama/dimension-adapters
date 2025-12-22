import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

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
  MultiDepositorVaultCreated:
    'event VaultCreated(address indexed vault, address indexed owner, address hooks, (string name, string symbol) erc20Params, (address feeCalculator, address feeToken, address feeRecipient) feeVaultParams, address beforeTransferHook, string description)',
  SingleDepositorVaultCreated:
    'event VaultCreated(address indexed vault, address indexed owner, address submitHooks, address feeToken, address feeCalculator, address feeRecipient, string description)',
  FeesClaimed: 'event FeesClaimed(address indexed feeRecipient, uint256 fees)',
  ProtocolFeesClaimed: 'event ProtocolFeesClaimed(address indexed protocolFeeRecipient, uint256 protocolEarnedFees)',
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, getLogs } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const chainConfig = config[chain];

  const [multiDepositorVaultLogs, singleDepositorVaultLogs] = await Promise.all([
    getLogs({
      target: chainConfig.multiDepositorVaultFactory.address,
      eventAbi: abis.MultiDepositorVaultCreated,
      fromBlock: chainConfig.multiDepositorVaultFactory.fromBlock,
    }),
    getLogs({
      target: chainConfig.singleDepositorVaultFactory.address,
      eventAbi: abis.SingleDepositorVaultCreated,
      fromBlock: chainConfig.singleDepositorVaultFactory.fromBlock,
    }),
  ]);

  const vaultInfo: { vault: string; feeToken: string; feeRecipient: string }[] = [];

  multiDepositorVaultLogs.forEach((log: any) => {
    vaultInfo.push({
      vault: log.vault,
      feeToken: log.feeVaultParams.feeToken,
      feeRecipient: log.feeVaultParams.feeRecipient,
    });
  });

  // Process single-depositor vaults
  singleDepositorVaultLogs.forEach((log: any) => {
    vaultInfo.push({
      vault: log.vault,
      feeToken: log.feeToken,
      feeRecipient: log.feeRecipient,
    });
  });

  // Get fee claim events from all vaults (both FeesClaimed and ProtocolFeesClaimed)
  const [feesClaimedLogs, protocolFeesClaimedLogs] = await Promise.all([
    Promise.all(
      vaultInfo.map(({ vault, feeToken }) =>
        getLogs({
          target: vault,
          eventAbi: abis.FeesClaimed,
        }).then((logs) =>
          logs.map((log: any) => ({
            amount: log.fees,
            feeToken: feeToken,
            recipient: log.feeRecipient,
          }))
        )
      )
    ),
    Promise.all(
      vaultInfo.map(({ vault, feeToken }) =>
        getLogs({
          target: vault,
          eventAbi: abis.ProtocolFeesClaimed,
        }).then((logs) =>
          logs.map((log: any) => ({
            amount: log.protocolEarnedFees,
            feeToken: feeToken,
            recipient: log.protocolFeeRecipient,
          }))
        )
      )
    ),
  ]);

  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Process guardian fees (FeesClaimed) - goes to vault guardians/operators
  feesClaimedLogs.flat().forEach((claim) => {
    if (claim.amount && claim.feeToken) {
      dailyFees.add(claim.feeToken, claim.amount, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(claim.feeToken, claim.amount, METRIC.ASSETS_YIELDS);
    }
  });

  // Process protocol fees (ProtocolFeesClaimed) - goes to Aera protocol
  protocolFeesClaimedLogs.flat().forEach((claim) => {
    if (claim.amount && claim.feeToken) {
      dailyFees.add(claim.feeToken, claim.amount, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(claim.feeToken, claim.amount, METRIC.MANAGEMENT_FEES);
      dailyProtocolRevenue.add(claim.feeToken, claim.amount, METRIC.MANAGEMENT_FEES);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Yields earned on vault deposits",
    [METRIC.MANAGEMENT_FEES]: "Management fees occured on fee enabled vaults",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees occured on fee enabled vaults",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yields earned on vault deposits",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees occured on fee enabled vaults",
  }
}

const methodology = {
  Fees: "Total fees from vault operations, including both guardian fees and protocol fees. Fees include TVL fees and performance fees, capped at approximately 3.1536% annually.",
  Revenue: "Protocol fees collected by Aera platform from vault operations.",
  ProtocolRevenue: "Protocol fees collected by Aera platform from vault operations.",
  SupplySideRevenue: "Guardian fees paid to vault operators/guardians who manage the vaults and execute strategies.",
}

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
