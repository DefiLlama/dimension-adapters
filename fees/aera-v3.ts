import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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

  if (!chainConfig) {
    throw new Error('No configuration found for chain: ' + chain);
  }

  // Get all vaults created from both factories
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

  // Extract vault addresses and their fee tokens
  const vaultInfo: { vault: string; feeToken: string; feeRecipient: string }[] = [];

  // Process multi-depositor vaults
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
      dailyFees.add(claim.feeToken, claim.amount);
      dailySupplySideRevenue.add(claim.feeToken, claim.amount);
    }
  });

  // Process protocol fees (ProtocolFeesClaimed) - goes to Aera protocol
  protocolFeesClaimedLogs.flat().forEach((claim) => {
    if (claim.amount && claim.feeToken) {
      dailyFees.add(claim.feeToken, claim.amount);
      dailyRevenue.add(claim.feeToken, claim.amount);
      dailyProtocolRevenue.add(claim.feeToken, claim.amount);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-05-28',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-05-28',
    },
  },
  methodology: {
    Fees: "Total fees from vault operations, including both guardian fees and protocol fees. Fees include TVL fees and performance fees, capped at approximately 3.1536% annually.",
    Revenue: "Protocol fees collected by Aera platform from vault operations.",
    ProtocolRevenue: "Protocol fees collected by Aera platform from vault operations.",
    SupplySideRevenue: "Guardian fees paid to vault operators/guardians who manage the vaults and execute strategies.",
  },
};

export default adapter;

