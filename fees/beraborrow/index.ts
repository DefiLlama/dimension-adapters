import { Interface, ZeroAddress } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import * as sdk from '@defillama/sdk'

const normalizeAddress = sdk.util.normalizeAddress;

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

const FallbackCollateralVaults: Array<string> = [
  '0x9158d1b0c9Cc4EC7640EAeF0522f710dADeE9a1B',
  '0xAA2cBDe9f11f09ee9774D6d6C98dbB4792d9549a',
  '0x3dfeBfc084dA9C8749Ef06839F399867C3448FdD',
  '0x7B3487fFE71110a636e318f9E7a330f15Fd5436F',
  '0x33aD23316A0C3dd999d4AeDe4fe99074DE42324b',
  '0x933bD39CeDb5947523110c33E98bEa8480978adB',
  '0xE59AB0C3788217e48399Dae3CD11929789e4d3b2',
  '0xebB8152a4E5Bd5DB71EACEbC5239A414D46E9C59',
  '0xCd6e82Dc0A62489688f8aB5dd4414d085C9bA4F7',
  '0xD60c309053d75bcf939Bb0762F9F011096c929De',
  '0x0430f05228E3a471C8C79B62835B967CF707060F',
  '0x86d662DAD49D7584Caee6839E01D15B05Fa01204',
  '0xc837E31a5440A294a8296237986aFeC64C43dA75',
  '0xD08BE9db61798FbE8a5F10C01e31C39956Ad545B',
  '0x93e39028f76b572702A29E43c9996A5BE0Cb7bd8',
  '0x60AfF0Ff28F54eaD6B2cc676206fE329b645b1CD',
  '0x4069A3f38d76190bC2af5324a2A0EFa81Bc52d3c',
  '0xfC3111435C6d4CD1431862346Ac9646d21752Bb0',
  '0xe62954577718CB92D59236Da8c483A8b44F83eEd',
  '0xA8a3Dc9A75ec56C99287ad2Fd3b5E5f236d40DeE',
  '0x5Aa4f0fecd81B94A6A7d85c3797bf64864C938c0',
  '0x3bc3028e88341F8b319bD3178BA0b10706787b75',
  '0x9b089d29dD48B5c1B20B2867372a2fDE16875080',
  '0x32Ff3CEd25b916d52641D4081753F8951Faa7249',
]

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

  // CollateralVaultRegistry contract was deployed on 2025-04-03
  // before that, we use FallbackCollateralVaults
  // after that, we get vaults list from CollateralVaultRegistry
  let collateralVaults: Array<string> = FallbackCollateralVaults
  if (options.api.timestamp && options.api.timestamp >= 1743724800) {
    collateralVaults = (await options.api.call({
      abi: Abis.getCollateralVaults,
      target: Contracts.CollateralVaultRegistry,
    })).map((vault: any) => vault.vault)
  }

  const collateralVaultsAssets = (await options.api.multiCall({
    abi: Abis.asset,
    calls: collateralVaults,
    permitFailure: true,
  })).map(item => item !== null ? item : ZeroAddress) // use ZeroAddress for non-existed vaults
  const collateralVaultsDecimals = await options.api.multiCall({
    abi: Abis.decimals,
    calls: collateralVaults,
    permitFailure: true,
  })
  const collateralVaultsAssetsDecimals = await options.api.multiCall({
    abi: Abis.decimals,
    calls: collateralVaultsAssets,
    permitFailure: true,
  })

  for (let i = 0; i < collateralVaults.length; i++) {
    if (collateralVaultsAssets[i] && collateralVaultsAssets[i] !== ZeroAddress) {
      const vault = normalizeAddress(collateralVaults[i])
      vaults[vault] = {
        vault,
        asset: collateralVaultsAssets[i],
        vaultDecimals: Number(collateralVaultsDecimals[i]),
        assetDecimals: Number(collateralVaultsAssetsDecimals[i])
      }
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
    permitFailure: true,
  });

  // flat the tuples into a single array
  const flatTuples = tuples.filter(item => item !== null).reduce((acc: any, tuple: any) => {
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
  if (collaterals.length > 0) {
    const liquidataionLogs = await options.getLogs({
      targets: collaterals,
      flatten: false,
      eventAbi: Abis.TransferEvent,
    });
    liquidataionLogs.forEach((logs: any, index: any) => {
      const collateral = collaterals[index]
      logs
        // filter for transfers from denManagers and to ProtocolFeeRecipient
        .filter((log: any) => denManagersSet.has(log.from.toLowerCase()) && String(log.to).toLowerCase() === Contracts.ProtocolFeeRecipient)
        .forEach((log: any) => {
          dailyFees.add(collateral, log.value);
        });
    })
  }

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
