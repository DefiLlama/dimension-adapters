import { Interface, ZeroAddress } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { normalizeAddress } from "@defillama/sdk/build/util";

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function getAddressParam(address: string): string {
  return `0x000000000000000000000000${address.substring(2).toLowerCase()}`
}

const Abis = {
  asset: 'address:asset',
  decimals: 'uint8:decimals',
  debtToken: 'address:debtToken',
  getCollateralVaults: 'function getCollateralVaults() view returns (tuple(address vault, uint blockNumbe, uint8 protocolInstance)[])',
  getAllCollateralsAndDenManagers: 'function getAllCollateralsAndDenManagers() view returns (tuple(address collateral, address[] denManagers)[])',

  // events
  PerformanceFeeEvent: 'event PerformanceFee(address indexed token, uint256 amount)',
  TransferEvent: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  BorrowingFeePaidEvent: 'event BorrowingFeePaid(address indexed name, address indexed borrower, uint256 amount)',
  DepositEvent: 'event Deposit(address indexed caller, address indexed stable, uint stableAmount, uint mintedNect, uint fee)',
  WithdrawEvent: 'event Withdraw(address indexed caller, address indexed stable, uint stableAmount, uint burnedNect, uint fee)',
}

const Contracts = {
  NECT: '0x1cE0a25D13CE4d52071aE7e02Cf1F6606F4C79d3',
  CollateralVaultRegistry: '0xcE997aC8FD015A2B3c3950Cb33E9e6Bb962E35e1',
  LiquidStabilityPool: '0x597877Ccf65be938BD214C4c46907669e3E62128',
  ProtocolFeeRecipient: '0xce7d3fd53c0510325b3cebb96298522e6c538753',
  BorrowerOperations: [
    '0x1cE0a25D13CE4d52071aE7e02Cf1F6606F4C79d3',
    '0xDB32cA8f3bB099A76D4Ec713a2c2AACB3d8e84B9',
  ],
  NectGasPool: '0x088D80A806b015a3047baF3e8D0A391B3D13e0c8',
  DenManagerGettersContracts: [
    '0xa2ECbE7a6BBfB0F14ABbCFE3c19FE54dC7878588',
    '0xFA7908287c1f1B256831c812c7194cb95BB440e6',
  ],
  PSMContracts: [
    '0x6983E589E57E244B4e42FA8293B4128d15D4AaC6',
    '0xB2F796FA30A8512C1D27a1853a9a1a8056b5CC25',
  ],
}

interface CollateralVault {
  vault: string;
  asset: string;
  vaultDecimals: number;
  assetDecimals: number;
}

interface CollateralVaultAmount extends CollateralVault {
  amount: bigint;
}

async function getCollateralVaults(options: FetchOptions): Promise<{[key: string]: CollateralVault}> {
  const vaults: {[key: string]: CollateralVault} = {}

  const collateralVaults = (await options.api.call({
    abi: Abis.getCollateralVaults,
    target: Contracts.CollateralVaultRegistry,
  })).map((vault: any) => vault.vault)
  const collateralVaultsAssets = await options.api.multiCall({
    abi: Abis.asset,
    calls: collateralVaults,
  })
  const collateralVaultsDecimals = await options.api.multiCall({
    abi: Abis.decimals,
    calls: collateralVaults,
  })
  const collateralVaultsAssetsDecimals = await options.api.multiCall({
    abi: Abis.decimals,
    calls: collateralVaultsAssets,
  })

  for (let i = 0; i < collateralVaults.length; i++) {
    const vault = normalizeAddress(collateralVaults[i])
    vaults[vault] = {
      vault,
      asset: collateralVaultsAssets[i],
      vaultDecimals: Number(collateralVaultsDecimals[i]),
      assetDecimals: Number(collateralVaultsAssetsDecimals[i])
    }
  }

  return vaults
}

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // get vaults and assets
  const collateralVaults = await getCollateralVaults(options)

  //
  // get perfomrance fees from event logs
  //
  const performanceFeeEvents = await options.getLogs({
    targets: Object.keys(collateralVaults),
    eventAbi: Abis.PerformanceFeeEvent,
    flatten: true,
  })
  for (const event of performanceFeeEvents) {
    const eventToken = normalizeAddress(event.token)
    let vaultToken = collateralVaults[eventToken] ? collateralVaults[eventToken].asset : null
    if (!vaultToken) {
      vaultToken = eventToken
    }
    dailyFees.add(vaultToken, event.amount);
  }

  //
  // get collateral withdrawal fees by counting collateral transferred to fee recipient
  //
  const vaultContractInterface: Interface = new Interface([
    Abis.TransferEvent,
  ])
  const collateralVaultsWithdrawEvents: Array<CollateralVaultAmount> = (await options.getLogs({
    targets: Object.keys(collateralVaults),
    eventAbi: Abis.TransferEvent,
    topics: [
      TRANSFER_TOPIC,
      getAddressParam(ZeroAddress),
      getAddressParam(Contracts.ProtocolFeeRecipient),
    ],
    flatten: true,
    entireLog: true,
  })).map((log: any) => {
    const decodeLog: any = vaultContractInterface.parseLog(log)
    return {
      ...collateralVaults[normalizeAddress(log.address)],
      amount: BigInt(decodeLog.args.value),
    }
  })
  for (const event of collateralVaultsWithdrawEvents) {
    const tokenAmount = event.amount * BigInt(10 ** event.assetDecimals) / BigInt(10 ** event.vaultDecimals)
    dailyFees.add(event.asset, tokenAmount)
  }

  //
  // get LSP deposit/withdraw fees by counting sNECT transferred to fee recipient
  //
  const lspTransferEvents = await options.getLogs({
    target: Contracts.LiquidStabilityPool,
    eventAbi: Abis.TransferEvent,
    topics: [
      TRANSFER_TOPIC,
      getAddressParam(ZeroAddress),
      getAddressParam(Contracts.ProtocolFeeRecipient),
    ],
  })
  lspTransferEvents.forEach((event: any) => {
    dailyFees.add(Contracts.NECT, event.value)
  })

  //
  // Borrowing Fee
  //
  const borrowingFeePaidEvents = await options.getLogs({
    targets: Contracts.BorrowerOperations,
    eventAbi: Abis.BorrowingFeePaidEvent,
  });
  const uniqueBorrowing = borrowingFeePaidEvents.reduce((acc: any, log: any) => {
    acc[log.name] = (acc[log.name] || new BigNumber(0)).plus(log.amount);
    return acc;
  }, {});
  const uniqueBorrowingNames = Object.keys(uniqueBorrowing);
  const uniqueBorrowingAmounts = Object.values(uniqueBorrowing);
  const debtTokens = await options.api.multiCall({
    abi: Abis.debtToken,
    calls: uniqueBorrowingNames,
  });
  uniqueBorrowingNames.map((_, i: number) => {
    dailyFees.add(debtTokens[i], uniqueBorrowingAmounts[i])
  });

  //
  // Liquidation fee (Debt gas compensation - TEMPORARY) -- Duplciate with borrowing Fee
  //
  const liquidationEvents = await options.getLogs({
    target: Contracts.NECT,
    eventAbi: Abis.TransferEvent,
    topics: [
      TRANSFER_TOPIC,
      getAddressParam(Contracts.NectGasPool),
      getAddressParam(Contracts.ProtocolFeeRecipient),
    ],
  })
  liquidationEvents.forEach((event: any) => {
    dailyFees.add(Contracts.NECT, event.value);
  })

  //
  // Liquidation fee (Collateral gas compensation - TEMPORARY)
  //
  const tuples = await options.api.multiCall({
    abi: Abis.getAllCollateralsAndDenManagers,
    calls: Contracts.DenManagerGettersContracts,
  });

  // flat the tuples into a single array
  const flatTuples = tuples.reduce((acc: any, tuple: any) => {
    return acc.concat(tuple);
  }, []);

  const denManagersSet = new Set();
  const collateralSet = new Set();
  flatTuples.map((tuple: any) => {
    const denManagers = tuple.denManagers;
    collateralSet.add(tuple.collateral.toLowerCase());
    denManagers.forEach((denManager: any) => denManagersSet.add(denManager.toLowerCase()));
  });
  const collaterals = Array.from(collateralSet) as string[];
  const liquidataionLogs = await options.getLogs({
    targets: collaterals,
    flatten: false,
    eventAbi: Abis.TransferEvent,
    topics: [
      TRANSFER_TOPIC,
      getAddressParam(ZeroAddress),
      getAddressParam(Contracts.ProtocolFeeRecipient),
    ],
  });
  liquidataionLogs.forEach((logs: any, index: any) => {
    const collateral = collaterals[index]
    logs
      .filter((log: any) => denManagersSet.has(log.from.toLowerCase()))  // filter for transfers from denManagers
      .forEach((log: any) => {
        dailyFees.add(collateral, log.value);
      });
  })

  // PermissionlessPSM deposit fee (in NECT)
  const psmDepositLogs = await options.getLogs({
    targets: Contracts.PSMContracts,
    eventAbi: Abis.DepositEvent,
  });
  psmDepositLogs.forEach((log) => {
    dailyFees.add(Contracts.NECT, log.fee);
  });

  // PermissionlessPSM withdrawal fee (fee is in indexed stable)
  const psmWithdrawLogs = await options.getLogs({
    targets: Contracts.PSMContracts,
    eventAbi: Abis.WithdrawEvent,
  });
  psmWithdrawLogs.forEach((log) => {
    dailyFees.add(log.stable, log.fee);
  });

  return { 
    dailyFees,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetchFees,
      start: "2025-02-14",
    },
  },
};

export default adapter;
