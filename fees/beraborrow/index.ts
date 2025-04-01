import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";
import BigNumber from "bignumber.js";

const FEE_RECEIVER = 'ce7d3fd53c0510325b3cebb96298522e6c538753';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const fetchFees = async (options: FetchOptions, getToBlock: FetchOptions) => {
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
            "0x0000000000000000000000000000000000000000000000000000000000000000", // from == zero address
            "0x000000000000000000000000ce7d3fd53c0510325b3cebb96298522e6c538753", // to == specific address
          ],
        });
    
        if (logs.length === 0) return new BigNumber(0);
    
        const total = logs.reduce((acc: BigNumber, log: any) => {
          return acc.plus(new BigNumber(log[2]));
        }, new BigNumber(0));
    
        return total;
      })
    );
    // Those wirthdrawal fees are shares
    /// we need to convert them to assets calling in each collateral address method convertToAssets with the fee
    
    const calls = collaterals.map((collateral, index) => ({
      target: collateral, // assuming collateral has convertToAssets
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
    const token = debtTokens[i];
    dailyFees.add(token, log.amount);
  });

// DenManager Redemption Fees


  // grab each denManager address from tuples
  const denManagers = tuples.map(t => t.denManagers).flat();
  // loop through each denManager address and get the logs
  const DenManagerRedemtionFee = [];
  for (const denManager of denManagers) {
    const logs = await options.getLogs({
      target: denManager,
      eventAbi: "event RedemptionFee(address indexed _denManager, address indexed _redeemer, uint256 _attemptedDebtAmount, uint256 _actualDebtAmount, uint256 _collateralSent, uint256 _collateralFee)",
      fromBlock: 10
    });
    if (logs.length == 0) {
      DenManagerRedemtionFee.push(0);
    }
    logs.forEach((log: any) => {
      DenManagerRedemtionFee.push(log.collateralFee);
    });
  }

  dailyFees.add(assets, DenManagerRedemtionFee);



// Liquidation fee (Debt gas compensation - TEMPORARY)
// All events in NECT that have `from` as gasPoolAddress and `to` as feeReceiver:
// event Transfer(from, to, amount)

const NectGasPool = "0x088D80A806b015a3047baF3e8D0A391B3D13e0c8";
const NECT = "0x1cE0a25D13CE4d52071aE7e02Cf1F6606F4C79d3"

const logs = await options.getLogs({
  target: NECT,
  eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  topics: [
    TRANSFER_TOPIC,
    "0x000000000000000000000000088d80a806b015a3047baf3e8d0a391b3d13e0c8",
    "0x000000000000000000000000ce7d3fd53c0510325b3cebb96298522e6c538753", // to == fee receiver
  ],
  fromBlock: 2862557
})

const total = logs.reduce((acc: BigNumber, log: any) => {
    return acc.plus(new BigNumber(log[2]));
  }, new BigNumber(0));

dailyFees.add(NECT, total);

// Liquidation fee (Collateral gas compensation - TEMPORARY)
// All events in the collateral token of each DenManager where transfer is from the DenManager and
// to is feeReceiver and tx.origin is NOT feeReceiver:
// event Transfer(from, to, amount)

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
        "0x000000000000000000000000ce7d3fd53c0510325b3cebb96298522e6c538753",
      ],
    });
    
    const total = logs.reduce((acc: BigNumber, log: any) => {
      return acc.plus(new BigNumber(log[2]));
    }, new BigNumber(0));

    dailyFees.add(collateral, total);
  })
);

  
  


// PermissionlessPSM deposit fee (in NECT)
// Must look at both new and old contracts
// Old contract address: 0xB2F796FA30A8512C1D27a1853a9a1a8056b5CC25
// New contract: 0x698385E59E57E244B4e42FA8293B4128d15D4a4C6
// event Deposit(address indexed caller, address indexed stable, uint stableAmount, uint mintedNect, uint fee)

// const OldPSMDeposit = await options.getLogs({
//   target: "0xB2F796FA30A8512C1D27a1853a9a1a8056b5CC25",
//   eventAbi: "event Deposit(address indexed caller, address indexed stable, uint stableAmount, uint mintedNect, uint fee)",
//   fromBlock: 2948910,
// });

const NewPSMDeposit = await options.getLogs({
  target: "0x698385E59E57E244B4e42FA8293B4128d15D4a4C6",
  eventAbi: "event Deposit(address indexed caller, address indexed stable, uint stableAmount, uint mintedNect, uint fee)",
  fromBlock: 2948910,
});

const allPSMDeposit = [...NewPSMDeposit];
console.log(NewPSMDeposit)
// fee in NECT

// allPSMDeposit.forEach((log: any) => {
//   const stable = log.stable.toLowerCase();
//   const fee = log.fee.toString();
//   const stableAmount = log.stableAmount.toString();
//   const mintedNect = log.mintedNect.toString();
//   const amount = new BigNumber(stableAmount).minus(new BigNumber(fee)).toString();
//   const feeAmount = new BigNumber(fee).plus(new BigNumber(mintedNect)).toString();
//   dailyFees.add(stable, amount);



// PermissionlessPSM withdrawal fee (fee is in indexed stable)
// event Withdraw(address indexed caller, address indexed stable, uint stableAmount, uint burnedNect, uint fee)

// LSP deposit and withdrawal fee
// All LSP events where `from` is address(0) and `to` is feeReceiver and tx.origin is NOT feeReceiver
// These have also been from our multisig since the beginning:
// event Transfer(from, to, value)

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
