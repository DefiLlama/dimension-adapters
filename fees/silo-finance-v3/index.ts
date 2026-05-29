import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://docs.silo.finance/docs/category/protocol-overview
// https://github.com/silo-finance/silo-contracts-v3
const PRECISION = BigInt(1e18);

const configV3: {
  [chain: string]: {
    start: string;
    factories: { START_BLOCK: number; SILO_FACTORY: string }[];
  };
} = {
  [CHAIN.ARBITRUM]: {
    start: "2026-02-24",
    factories: [
      {
        START_BLOCK: 435460074,
        SILO_FACTORY: "0xafd8f792cb025a76c4916652cfc8e20eee3b6fe2",
      },
    ],
  },
  [CHAIN.AVAX]: {
    start: "2026-02-24",
    factories: [
      {
        START_BLOCK: 78875406,
        SILO_FACTORY: "0x9e64f0cd206cce2da5de08e7f482d62f57013d0e",
      },
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: "2026-02-24",
    factories: [
      {
        START_BLOCK: 24527218,
        SILO_FACTORY: "0x1dab4a310447185144467076b116dac7aec3b48f",
      },
    ],
  },
  [CHAIN.SONIC]: {
    start: "2026-02-24",
    factories: [
      {
        START_BLOCK: 63632954,
        SILO_FACTORY: "0xf81d90df1b63d48536e78564d24d5dd8f2be58ad",
      },
    ],
  },
  [CHAIN.XDC]: {
    start: "2026-03-27",
    factories: [
      {
        START_BLOCK: 100790923,
        SILO_FACTORY: "0xf81d90df1b63d48536e78564d24d5dd8f2be58ad",
      },
    ],
  },
  [CHAIN.MEGAETH]: {
    start: "2026-04-27",
    factories: [
      {
        START_BLOCK: 14488088,
        SILO_FACTORY: "0x95a7bc57c738c7f64103b93d04f49cbca566affd",
      },
    ],
  },
};

const abis = {
  newSiloEvent:
    "event NewSilo(address indexed implementation, address indexed token0, address indexed token1, address silo0, address silo1, address siloConfig)",
  getSiloStorage:
    "function getSiloStorage() view returns (uint192 daoAndDeployerRevenue, uint64 interestRateTimestamp, uint256 protectedAssets, uint256 collateralAssets, uint256 debtAssets)",
  getDebtAssets:
    "function getDebtAssets() view returns (uint256)",
  getFeesWithAsset:
    "function getFeesWithAsset(address _silo) view returns (uint256 daoFee, uint256 deployerFee, uint256 flashloanFee, address asset)",
  withdrawnFeesEvent:
    "event WithdrawnFees(uint256 daoFees, uint256 deployerFees, bool redirectedDeployerFees)",
  flashLoanEvent:
    "event FlashLoan(uint256 amount)",
};

type SiloInfo = {
  silo: string;
  siloConfig: string;
};

async function getSilosWithConfig(
  options: FetchOptions
): Promise<SiloInfo[]> {
  const silos: SiloInfo[] = [];
  const chain = options.api.chain;
  if (!configV3[chain]) {
    throw new Error(`Chain ${chain} is missing configuration`);
  }

  const factories = configV3[chain].factories.map((factory) => factory.SILO_FACTORY);
  const fromBlock = Math.min(...configV3[chain].factories.map((factory) => factory.START_BLOCK));

    const logs = await options.getLogs({
      targets: factories,
      fromBlock,
      eventAbi: abis.newSiloEvent,
      cacheInCloud: true,
    });

    for (const log of logs) {
      silos.push(
        { silo: log.silo0, siloConfig: log.siloConfig },
        { silo: log.silo1, siloConfig: log.siloConfig }
      );
    }

  return silos;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const silosWithConfig = await getSilosWithConfig(options);
  if (silosWithConfig.length === 0) return {};

  const siloAddresses = silosWithConfig.map((s) => s.silo);

  // Get fee config for each silo
  const feeConfigs = await options.api.multiCall({
    abi: abis.getFeesWithAsset,
    calls: silosWithConfig.map((s) => ({
      target: s.siloConfig,
      params: [s.silo],
    })),
    permitFailure: true,
  });

  // Get storage, computed debt, and events at both timestamps
  // getSiloStorage returns (pre-accrual) values
  // getDebtAssets computes interest (includes pending interest)
  const [storageBefore, storageAfter, debtWithInterestBefore, debtWithInterestAfter, allWithdrawalLogs, allFlashLoanLogs] = await Promise.all([
    options.fromApi.multiCall({
      abi: abis.getSiloStorage,
      calls: siloAddresses,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: abis.getSiloStorage,
      calls: siloAddresses,
      permitFailure: true,
    }),
    options.fromApi.multiCall({
      abi: abis.getDebtAssets,
      calls: siloAddresses,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: abis.getDebtAssets,
      calls: siloAddresses,
      permitFailure: true,
    }),
    options.getLogs({
      targets: siloAddresses,
      eventAbi: abis.withdrawnFeesEvent,
      flatten: false,
    }),
    options.getLogs({
      targets: siloAddresses,
      eventAbi: abis.flashLoanEvent,
      flatten: false,
    }),
  ]);

  const withdrawnDaoMap = new Map<number, bigint>();
  const withdrawnDeployerMap = new Map<number, bigint>();
  for (let i = 0; i < allWithdrawalLogs.length; i++) {
    const logs = allWithdrawalLogs[i];
    if (!logs || logs.length === 0) continue;
    let daoWithdrawn = 0n;
    let deployerWithdrawn = 0n;
    for (const log of logs) {
      daoWithdrawn += BigInt(log.daoFees);
      deployerWithdrawn += BigInt(log.deployerFees);
    }
    withdrawnDaoMap.set(i, daoWithdrawn);
    withdrawnDeployerMap.set(i, deployerWithdrawn);
  }

  // Sum flash loan amounts per silo
  const flashLoanAmountMap = new Map<number, bigint>();
  for (let i = 0; i < allFlashLoanLogs.length; i++) {
    const logs = allFlashLoanLogs[i];
    if (!logs || logs.length === 0) continue;
    let totalAmount = 0n;
    for (const log of logs) {
      totalAmount += BigInt(log.amount);
    }
    flashLoanAmountMap.set(i, totalAmount);
  }

  for (let i = 0; i < siloAddresses.length; i++) {
    if (!storageBefore[i] || !storageAfter[i] || !feeConfigs[i]) continue;
    if (debtWithInterestBefore[i] == null || debtWithInterestAfter[i] == null) continue;

    const asset = feeConfigs[i].asset;
    const daoFee = BigInt(feeConfigs[i].daoFee);
    const deployerFee = BigInt(feeConfigs[i].deployerFee);
    const flashloanFee = BigInt(feeConfigs[i].flashloanFee);
    const combinedFeeRate = daoFee + deployerFee;

    if (combinedFeeRate === 0n) continue;

    // realized (stored) revenue + pending (unaccrued) fees
    const storedRevBefore = BigInt(storageBefore[i].daoAndDeployerRevenue);
    const storedRevAfter = BigInt(storageAfter[i].daoAndDeployerRevenue);

    const storedDebtBefore = BigInt(storageBefore[i].debtAssets);
    const storedDebtAfter = BigInt(storageAfter[i].debtAssets);

    const debtIncludingInterestBefore = BigInt(debtWithInterestBefore[i]);
    const debtIncludingInterestAfter = BigInt(debtWithInterestAfter[i]);

    // Pending interest = debt with interest (includes unaccrued) - stored debt
    const pendingInterestBefore = debtIncludingInterestBefore > storedDebtBefore
      ? debtIncludingInterestBefore - storedDebtBefore : 0n;
    const pendingInterestAfter = debtIncludingInterestAfter > storedDebtAfter
      ? debtIncludingInterestAfter - storedDebtAfter : 0n;

    // Pending protocol fees from pending interest
    const pendingFeesBefore = (pendingInterestBefore * combinedFeeRate) / PRECISION;
    const pendingFeesAfter = (pendingInterestAfter * combinedFeeRate) / PRECISION;

    // Protocol revenue at each point = realized (stored) + pending (unaccrued)
    const daoAndDeployerRevBefore = storedRevBefore + pendingFeesBefore;
    const daoAndDeployerRevAfter = storedRevAfter + pendingFeesAfter;

    const daoWithdrawn = withdrawnDaoMap.get(i) ?? 0n;
    const deployerWithdrawn = withdrawnDeployerMap.get(i) ?? 0n;
    const totalWithdrawn = daoWithdrawn + deployerWithdrawn;

    // Flash loan fees
    const flashLoanAmount = flashLoanAmountMap.get(i) ?? 0n;
    const flashLoanFeeTotal = (flashLoanAmount * flashloanFee) / PRECISION;

    // Total protocol revenue accrued during the period
    const totalProtocolRev = daoAndDeployerRevAfter - daoAndDeployerRevBefore + totalWithdrawn;
    if (totalProtocolRev <= 0n) continue;

    // Separate flash loan revenue from borrow interest revenue
    // Flash loan fees go 100% to protocol, borrow interest is split by combinedFeeRate
    const borrowProtocolRev = totalProtocolRev - flashLoanFeeTotal;

    // borrow interest from the borrow portion of protocol revenue
    const totalBorrowInterest = borrowProtocolRev > 0n
      ? (borrowProtocolRev * PRECISION) / combinedFeeRate : 0n;

    // Split total protocol revenue into DAO and deployer shares
    let daoRev = 0n;
    let deployerRev = 0n;

    if (daoFee > 0n && deployerFee > 0n) {
      daoRev = (totalProtocolRev * daoFee) / combinedFeeRate;
      deployerRev = totalProtocolRev - daoRev;
    } else if (daoFee > 0n) {
      daoRev = totalProtocolRev;
    } else {
      deployerRev = totalProtocolRev;
    }

    const borrowSupplySide = totalBorrowInterest - borrowProtocolRev;

    // dailyFees
    if (totalBorrowInterest > 0n) dailyFees.add(asset, totalBorrowInterest, METRIC.BORROW_INTEREST);
    if (flashLoanFeeTotal > 0n) dailyFees.add(asset, flashLoanFeeTotal, METRIC.FLASHLOAN_FEES);

    // dailyRevenue
    if (daoRev > 0n) {
      dailyRevenue.add(asset, daoRev, 'Borrow Interest To DAO');
      dailyProtocolRevenue.add(asset, daoRev, 'Borrow Interest To DAO');
    }
    if (deployerRev > 0n) {
      dailySupplySideRevenue.add(asset, deployerRev, 'Borrow Interest To Deployer');
    }
    if (flashLoanFeeTotal > 0n) {
      dailyRevenue.add(asset, flashLoanFeeTotal, METRIC.FLASHLOAN_FEES);
      dailyProtocolRevenue.add(asset, flashLoanFeeTotal, METRIC.FLASHLOAN_FEES);
    }

    // dailySupplySideRevenue — lender share of borrow interest
    if (borrowSupplySide > 0n) dailySupplySideRevenue.add(asset, borrowSupplySide, 'Borrow Interest To Lenders');
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: configV3,
  fetch,
  methodology: {
    Fees: "Interest paid by borrowers and flash loan fees across all Silo V3 lending markets.",
    Revenue: "DAO share of borrow interest and flash loan fees.",
    ProtocolRevenue: "DAO share of borrow interest and flash loan fees.",
    SupplySideRevenue: "Portion of borrow interest distributed to lenders (depositors) and deployer.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]:
        "Interest paid by borrowers to lenders based on their loan amount and the current interest rate set by Silo's interest rate model.",
      [METRIC.FLASHLOAN_FEES]:
        "The cost of taking a flash loan, set per-token per-silo at deployment.",
    },
    Revenue: {
      'Borrow Interest To DAO': "DAO share of borrow interest, based on the configured daoFee rate.",
      [METRIC.FLASHLOAN_FEES]: "Flash loan fees go entirely to the protocol (DAO and deployer).",
    },
    ProtocolRevenue: {
      'Borrow Interest To DAO': "DAO share of borrow interest, based on the configured daoFee rate.",
      [METRIC.FLASHLOAN_FEES]: "Flash loan fees go entirely to the protocol (DAO and deployer).",
    },
    SupplySideRevenue: {
      'Borrow Interest To Lenders':
        "Interest distributed to lenders (depositors) after DAO and deployer fees are deducted.",
      'Borrow Interest To Deployer': "Deployer share of borrow interest, based on the configured deployerFee rate.",
    },
  },
};

export default adapter;
