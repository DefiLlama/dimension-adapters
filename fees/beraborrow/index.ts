import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const FEE_RECEIVER = '0xce7d3fd53c0510325b3cebb96298522e6c538753';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PSMContracts = ["0x6983E589E57E244B4e42FA8293B4128d15D4AaC6", "0xB2F796FA30A8512C1D27a1853a9a1a8056b5CC25"]; // OLD - NEW Contracts
const NectGasPool = "0x088D80A806b015a3047baF3e8D0A391B3D13e0c8";
const NECT = "0x1cE0a25D13CE4d52071aE7e02Cf1F6606F4C79d3"
const zeroAddress = "0x0000000000000000000000000000000000000000000000000000000000000000"

const fetchFees = async (options: FetchOptions) => {

  const dailyFees = options.createBalances();

  const getCollateralVaults = await options.api.call({
    abi: "function getCollateralVaults() view returns (tuple(address collateral, uint blockNumbe, uint8 protocolInstance)[])",
    target: "0xcE997aC8FD015A2B3c3950Cb33E9e6Bb962E35e1",
  }); 
  
  const CollVaults = getCollateralVaults.map((vault: any) => {
    return vault.collateral
  });

// Performance Fees

  const performanceFeeLogs = await options.getLogs({
    targets: CollVaults,
    eventAbi: "event PerformanceFee(address indexed token, uint256 amount)",
  });

    performanceFeeLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount);
  });

// LSP Deposit / Withdraw Fee

  const LSPContract = "0x597877Ccf65be938BD214C4c46907669e3E62128"
  const logs  = await options.getLogs({
    target: LSPContract,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      TRANSFER_TOPIC,
      zeroAddress,
      "0x000000000000000000000000" + FEE_RECEIVER.substring(2),
    ],
  })
  const total = logs.reduce((acc: BigNumber, log: any) => {
    return acc.plus(new BigNumber(log[2]));
  }, new BigNumber(0));

  dailyFees.add(LSPContract, total);

// ColVault Withdraw Fee

const colVaultWithdrawShares  = await options.getLogs({
  targets: CollVaults,
  eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  topics: [
    TRANSFER_TOPIC,
    zeroAddress,
    "0x000000000000000000000000" + FEE_RECEIVER.substring(2),
  ],
  flatten: false,

})

const colVaultWithdraw = colVaultWithdrawShares.map((logs: any[]) => {
  if (!logs || logs.length === 0) return new BigNumber(0);
  return logs.reduce((acc: BigNumber, logItem: any) => {
        return acc.plus(logItem[2]);
      }
    , new BigNumber(0)
);
})

const calls = CollVaults.map((collateral, index) => ({
  target: collateral,
  params: [colVaultWithdraw[index].toFixed(0)],
}));


const withdrawalFeesInAssets = await options.api.multiCall({
  abi: 'function convertToAssets(uint256) view returns (uint256)',
  calls,
});
dailyFees.add(CollVaults, withdrawalFeesInAssets);


// Borrowing Fee

  const borrowingFeePaid = await options.getLogs({
    target: "0xdb32ca8f3bb099a76d4ec713a2c2aacb3d8e84b9",
    eventAbi: `event BorrowingFeePaid(address indexed name, address indexed borrower, uint256 amount)`
  });

  const uniqueBorrowing = borrowingFeePaid.reduce((acc: any, log: any) => {
    acc[log.name] = (acc[log.name] || new BigNumber(0)).plus(log.amount);
    return acc;
  }, {});

  const uniqueBorrowingNames = Object.keys(uniqueBorrowing);
  const uniqueBorrowingAmounts = Object.values(uniqueBorrowing);
  const DebtToken = await options.api.multiCall({
    abi: "address:debtToken",
    calls: uniqueBorrowingNames,
  });
  uniqueBorrowingNames.map((name: string, i: number) => {
    dailyFees.add(DebtToken[i], uniqueBorrowingAmounts[i] )
  });


// Liquidation fee (Debt gas compensation - TEMPORARY)

const logsLiquidation = await options.getLogs({
  target: NECT,
  eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  topics: [
    TRANSFER_TOPIC,
    "0x000000000000000000000000" + NectGasPool.substring(2),
    "0x000000000000000000000000" + FEE_RECEIVER.substring(2),
  ],
  
})


const totalLogsLiquidation = logsLiquidation.reduce((acc: BigNumber, log: any) => {
    return acc.plus(new BigNumber(log[2]));
  }, new BigNumber(0));

dailyFees.add(NECT, totalLogsLiquidation);

// Liquidation fee (Collateral gas compensation - TEMPORARY)

const tuples = await options.api.call({
  abi: "function getAllCollateralsAndDenManagers() view returns (tuple(address collateral, address[] denManagers)[])",
  target: "0xFA7908287c1f1B256831c812c7194cb95BB440e6",
});

await Promise.all(
    
  tuples.map(async (tuple) => {
    const denManagers = tuple.denManagers;
    const collateral = tuple.collateral;

    const logs = await options.getLogs({
      target: collateral,
      eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
      topics: [
        TRANSFER_TOPIC,
        "0x000000000000000000000000" + denManagers[0].substring(2),
        "0x000000000000000000000000" + FEE_RECEIVER.substring(2),
      ],
    });

    const total = logs.reduce((acc: BigNumber, log: any) => {
      return acc.plus(new BigNumber(log[2]));
    }, new BigNumber(0));

    dailyFees.add(collateral, total);
  })
);

// PermissionlessPSM deposit fee (in NECT)

await Promise.all(
  PSMContracts.map(async (psm) => {
    const logs = await options.getLogs({
      target: psm,
      eventAbi: "event Deposit(address indexed caller, address indexed stable, uint stableAmount, uint mintedNect, uint fee)",
    });

    const total = logs.reduce((acc, log) => acc.plus(new BigNumber(log[4])), new BigNumber(0));
    if (total.isGreaterThan(0)) dailyFees.add(NECT, total);
  })
);



// PermissionlessPSM withdrawal fee (fee is in indexed stable)

await Promise.all(
  PSMContracts.map(async (psm) => {
    const logs = await options.getLogs({
      target: psm,
      eventAbi: "event Withdraw(address indexed caller, address indexed stable, uint stableAmount, uint burnedNect, uint fee)",
    });
    
    logs.forEach((log) => {
      dailyFees.add(log.stable, log.fee);
    });
  })
);

  return { dailyFees};
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
