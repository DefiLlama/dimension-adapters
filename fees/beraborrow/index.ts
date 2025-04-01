import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";


const FEE_RECEIVER = 'Oxce7d3fd53c0510325b3cebb96298522e6c538753';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PSMContracts = ["0x6983E589E57E244B4e42FA8293B4128d15D4AaC6", "0xB2F796FA30A8512C1D27a1853a9a1a8056b5CC25"]; // OLD - NEW Contracts
const LSPRouter = "0x3A7ED65b35fDfaaCC9F0E881846A9F4E57181446"
const NectGasPool = "0x088D80A806b015a3047baF3e8D0A391B3D13e0c8";
const NECT = "0x1cE0a25D13CE4d52071aE7e02Cf1F6606F4C79d3"
const zeroAddress = "0x0000000000000000000000000000000000000000000000000000000000000000"


const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Withdrawal Fee (0.1% – 0.3%) -- Most are 0

    const tuples = await options.api.call({
      abi: "function getAllCollateralsAndDenManagers() view returns (tuple(address collateral, address[] denManagers)[])",
      target: "0xFA7908287c1f1B256831c812c7194cb95BB440e6",
    });
    
    const collaterals = tuples.map(t => t.collateral.toLowerCase());      
    const assets = await options.api.multiCall({
      abi: "address:asset",
      calls: collaterals.map((collateral: string) => ({ target: collateral })),
    });

    const withdrawalFees = await Promise.all(
      collaterals.map(async (collateral) => {
        const logs = await options.getLogs({
          target: collateral,
          eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
          topics: [
            TRANSFER_TOPIC,
            zeroAddress,
            "0x000000000000000000000000" + FEE_RECEIVER.substring(2),
          ],
        });
    
        if (logs.length === 0) return new BigNumber(0);
    
        const total = logs.reduce((acc: BigNumber, log: any) => {
          return acc.plus(new BigNumber(log[2]));
        }, new BigNumber(0));
    
        return total;
      })
    );
    
    const calls = collaterals.map((collateral, index) => ({
      target: collateral,
      params: [withdrawalFees[index].toString()],
    }));

    const withdrawalFeesInAssets = await options.api.multiCall({
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      calls,
    });

    dailyFees.add(assets, withdrawalFeesInAssets)


// Performance Fees
  const performanceFeeLogs = await options.getLogs({
    target: "0xe59ab0c3788217e48399dae3cd11929789e4d3b2",
    eventAbi: "event PerformanceFee(address indexed token, uint256 amount)",
  });

  performanceFeeLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount);
  });

// Borrowing Fee

  const borrowingFeePaid = await options.getLogs({
    target: "0xdb32ca8f3bb099a76d4ec713a2c2aacb3d8e84b9",
    eventAbi: `event BorrowingFeePaid(address indexed name, address indexed borrower, uint256 amount)`,
  });

  const debtTokens = await options.api.multiCall({
    abi: "address:debtToken",
    calls: borrowingFeePaid.map((log: any) => ({ target: log.name })),
  });

  borrowingFeePaid.forEach((log: any, i: number) => {
    dailyFees.add(debtTokens[i], log.amount);
  });

// DenManager Redemption Fees

const denManagers = tuples.flatMap(t => t.denManagers);

const DenManagerRedemptionFees = await Promise.all(
  denManagers.map(async (denManager) => {
    const logs = await options.getLogs({
      target: denManager,
      eventAbi: "event RedemptionFee(address indexed _denManager, address indexed _redeemer, uint256 _attemptedDebtAmount, uint256 _actualDebtAmount, uint256 _collateralSent, uint256 _collateralFee)",
      fromBlock: 10,
    });

    return logs.length > 0
      ? logs.map((log: any) => log.collateralFee)
      : [0];
  })
);

dailyFees.add(assets, DenManagerRedemptionFees.flat());




// Liquidation fee (Debt gas compensation - TEMPORARY)

const logs = await options.getLogs({
  target: NECT,
  eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  topics: [
    TRANSFER_TOPIC,
    "0x000000000000000000000000" + NectGasPool.substring(2),
    "0x000000000000000000000000" + FEE_RECEIVER.substring(2),
  ],
  fromBlock: 10
})

const total = logs.reduce((acc: BigNumber, log: any) => {
    return acc.plus(new BigNumber(log[2]));
  }, new BigNumber(0));

dailyFees.add(NECT, total);

// Liquidation fee (Collateral gas compensation - TEMPORARY)

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
// OLD AND new PSM

await Promise.all(
  PSMContracts.map(async (psm) => {
    const logs = await options.getLogs({
      target: psm,
      eventAbi: "event Withdraw(address indexed caller, address indexed stable, uint stableAmount, uint burnedNect, uint fee)",
      fromBlock: 1470110,
    });

    logs.forEach((log) => {
      const stable = log[1];
      const fee = log[4];
      if (stable && fee) dailyFees.add(stable, fee);
    });
  })
);


// LSP deposit and withdrawal fee

  const tokens = await options.api.call({
    target: LSPRouter,
    abi: "function lspUnderlyingTokens() view returns (address[])",
  });

  tokens.map(async (token) => {
    const logs = await options.getLogs({
      target: token,
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
    dailyFees.add(token, total);
});

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
