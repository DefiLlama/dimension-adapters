import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Parallel V2 (formerly Mimo): PAR (EUR) and paUSD (USD) borrowed against collateral in the Classic Vaults.
// https://docs.parallel.best/products/parallel-v3/fees#legacy-parallel-v2-fees-par-and-pausd
// Borrowers pay a borrowing fee (interest compounded per second on each collateral type's debt), an origination fee
// (0.2% of each new borrow) and a liquidation fee (0 on every collateral today), all added to the vaults' debt.
// VaultsCoreState.availableIncome() is the debt above the PAR or paUSD the core minted, and FeeDistributor.release()
// mints it to the payees. The fees of a day are the change in the income accrued, which is availableIncome() plus the
// interest accrued since each collateral type's last refresh, plus the income released that day.
// Every share is measured at that fee source, as the payee's share of the day's fees: no distribution, claim or
// buyback transaction is read.
// The history starts with PRL staking: sPRL1 was deployed on Ethereum on 2025-04-30 (block 22381541), and the PRL stakers'
// payee was added to the FeeDistributors on 2025-05-01.
const config: Record<string, { cores: string[]; start: string }> = {
  [CHAIN.ETHEREUM]: {
    cores: [
      "0x173AE6283A717b6cdD5491EAc5F82C082A8c674b", // PAR
      "0xE26348D30694aa7E879b9335252362Df3df93204", // paUSD
    ],
    start: "2025-04-30",
  },
  [CHAIN.POLYGON]: {
    cores: [
      "0x0a9202C6417A7B6B166e7F7fE2719b09261b400f", // PAR
      "0xcABAbC1Feb7C5298F69B635099D75975aD5E6e5f", // paUSD
    ],
    start: "2025-04-30",
  },
};

// FeeDistributor payees, by role. https://docs.parallel.best/governance/dao-multisigs
// The payees that pass their share on to PRL stakers (sPRL1, sPRL2) through a RewardMerkleDistributor:
// on Polygon in PAR from May 2025, and on Base in USDp from October 2026.
// https://docs.parallel.best/governance/parallel-governance-token-prl/tokenomics/fee-distribution
const SPRL_PAYEES = new Set([
  "0x2a4abc8dcbe2f68e48dfc0db5784c71db8d5b89c", // SideChainFeeCollector (PAR) on Ethereum, bridged to Polygon
  "0x90337e484b1cb02132fc150d3afa262147348545", // MainFeeDistributor (PAR) on Polygon
  "0xc351c917a7f7b267e86a5f5368be40fd1788c32b", // fee Safe, which converts its share for the distributor
]);
// The Insurance Fund, which covers the vaults' bad debt: 20% of the fees, supply side
const INSURANCE_FUND_PAYEES = new Set([
  "0x6af71a3723d3c0ed69f84ee259c9de3019c2a77c", // Insurance Fund Safe, on every chain
  "0x2c6a1d01057258281efe31bb34bc0df24c13086e", // its earlier Safe on Polygon, with the same signers, replaced in late 2025
]);
// Every other payee is the DAO Treasury: 0x25Fc7ffa8f9da3582a36633d04804F0004706F9b on Ethereum, 0x2046c0416A558C40cb112E5ebB0Ca764c3C5c32a on Polygon.

// PGP-42: from 2026-05-25 to 2026-10-01, the PRL stakers' 15% went to the DAO Treasury, to buy PRL back and burn it.
// That buyback is funded by the fees, so it is counted at the fee source as holders revenue (Token Buy Back), not as
// treasury revenue. The buybacks the Treasury pays from its own holdings are not counted anywhere.
// https://gov.parallel.best/t/pgp-42-redirect-sprl-par-distribution-to-prl-buyback-burn/539
// September 2026 went to PRL stakers instead: on 2026-10-01 the DAO Treasury sent them 15% of September's fees by hand,
// 5,701.93 PAR to the fee Safe, which funded the second epoch on Base.
// https://etherscan.io/tx/0x68c66bb2d346f27aec7e413b01a1909c076df56cae04e99a68151ccf2b9635b3
const SPRL_SHARE = 0.15;
const PGP_42 = { start: "2026-05-25", end: "2026-10-01" };
const PAID_TO_STAKERS_BY_HAND = { start: "2026-09-01", end: "2026-10-01" };
// One label for the three fees: the income accrued by a core does not tell interest, origination and liquidation fees apart.
const BORROWING_FEES = "Borrowing Fees";
const TO_TREASURY = "Borrowing Fees To Treasury";
const TO_PRL_HOLDERS = "Borrowing Fees To PRL Holders";
const TO_INSURANCE_FUND = "Borrowing Fees To Insurance Fund";

const ABI = {
  collateralConfig: "function collateralConfigs(uint256 _id) view returns ((address collateralType, uint256 debtLimit, uint256 liquidationRatio, uint256 minCollateralRatio, uint256 borrowRate, uint256 originationFee, uint256 liquidationBonus, uint256 liquidationFee))",
  collateralDebt: "function collateralDebt(address collateralType) view returns (uint256)",
  lastRefresh: "function lastRefresh(address collateralType) view returns (uint256)",
  payees: "function getPayees() view returns (address[])",
  shares: "function shares(address payee) view returns (uint256)",
};
const FEE_RELEASED = "event FeeReleased(uint256 income, uint256 releasedAt)";
const RAY = 1e27;

// availableIncome() plus the interest accrued since each collateral type's last refresh, in wei of PAR or paUSD.
// availableIncome() is debt - (supply - the amount minted by the bridge). It is computed here from those terms, because its
// SafeMath reverts once the bridge has minted more than the supply (Polygon paUSD, which has no debt left).
const accruedIncome = async (api: ChainApi, timestamp: number, core: string, stablex: string, vaultsData: string, configProvider: string) => {
  const state = await api.call({ abi: "address:state", target: core });
  const bridgeableToken = await api.call({ abi: "address:bridgeableToken", target: state });
  const [debt, supply, bridged, count] = await Promise.all([
    api.call({ abi: "uint256:debt", target: vaultsData }),
    api.call({ abi: "uint256:totalSupply", target: stablex }),
    api.call({ abi: "uint256:getPrincipalTokenAmountMinted", target: bridgeableToken }),
    api.call({ abi: "uint256:numCollateralConfigs", target: configProvider }),
  ]);
  const income = Number(debt) - (Number(supply) - Number(bridged));
  // the configs are numbered from 1; reading 0 to count covers both numberings, empty entries are skipped
  const ids = Array.from({ length: Number(count) + 1 }, (_, i) => i);
  const collaterals = (await api.multiCall({ abi: ABI.collateralConfig, target: configProvider, calls: ids, permitFailure: true }))
    .filter((c: any) => c && c.collateralType !== "0x0000000000000000000000000000000000000000");
  const types = collaterals.map((c: any) => c.collateralType);
  const [debts, lastRefreshes] = await Promise.all([
    api.multiCall({ abi: ABI.collateralDebt, target: vaultsData, calls: types }),
    api.multiCall({ abi: ABI.lastRefresh, target: state, calls: types }),
  ]);
  let accrued = 0;
  collaterals.forEach((c: any, i: number) => {
    const elapsed = timestamp - Number(lastRefreshes[i]);
    // a borrow rate at or below RAY charges no interest
    if (!Number(debts[i]) || elapsed <= 0 || Number(c.borrowRate) <= RAY) return;
    accrued += Number(debts[i]) * (Math.pow(Number(c.borrowRate) / RAY, elapsed) - 1);
  });
  return income + accrued;
};

// shares of the released income by role, from the FeeDistributor's payees
const getShares = async (api: ChainApi, feeDistributor: string) => {
  const payees: string[] = await api.call({ abi: ABI.payees, target: feeDistributor });
  const shares = await api.multiCall({ abi: ABI.shares, target: feeDistributor, calls: payees });
  const total = shares.reduce((sum: number, s: any) => sum + Number(s), 0);
  const split = { treasury: 0, insuranceFund: 0, sPrl: 0 };
  payees.forEach((p: string, i: number) => {
    const share = Number(shares[i]) / total;
    if (SPRL_PAYEES.has(p.toLowerCase())) split.sPrl += share;
    else if (INSURANCE_FUND_PAYEES.has(p.toLowerCase())) split.insuranceFund += share;
    else split.treasury += share;
  });
  return split;
};

const fetch = async (options: FetchOptions) => {
  const { chain, fromApi, toApi, fromTimestamp, toTimestamp, createBalances, getLogs, dateString } = options;
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  for (const core of config[chain].cores) {
    const addressProvider = await toApi.call({ abi: "address:a", target: core });
    const [stablex, vaultsData, configProvider, feeDistributor] = await Promise.all(
      ["stablex", "vaultsData", "config", "feeDistributor"].map((f) => toApi.call({ abi: `address:${f}`, target: addressProvider }))
    );
    const [incomeStart, incomeEnd, releases, shares] = await Promise.all([
      accruedIncome(fromApi, fromTimestamp, core, stablex, vaultsData, configProvider),
      accruedIncome(toApi, toTimestamp, core, stablex, vaultsData, configProvider),
      getLogs({ target: feeDistributor, eventAbi: FEE_RELEASED }),
      getShares(toApi, feeDistributor),
    ]);
    const released = releases.reduce((sum: number, log: any) => sum + Number(log.income), 0);
    const fees = incomeEnd - incomeStart + released;

    // under PGP-42 the stakers' payee is gone and the DAO Treasury's share holds their 15%
    let holdersLabel = METRIC.STAKING_REWARDS;
    if (dateString >= PGP_42.start && dateString < PGP_42.end && !shares.sPrl) {
      shares.treasury -= SPRL_SHARE;
      shares.sPrl = SPRL_SHARE;
      const paidByHand = dateString >= PAID_TO_STAKERS_BY_HAND.start && dateString < PAID_TO_STAKERS_BY_HAND.end;
      if (!paidByHand) holdersLabel = METRIC.TOKEN_BUY_BACK;
    }

    dailyFees.add(stablex, fees, BORROWING_FEES);
    dailySupplySideRevenue.add(stablex, fees * shares.insuranceFund, TO_INSURANCE_FUND);
    dailyRevenue.add(stablex, fees * shares.treasury, TO_TREASURY);
    dailyProtocolRevenue.add(stablex, fees * shares.treasury, TO_TREASURY);
    if (shares.sPrl) {
      dailyRevenue.add(stablex, fees * shares.sPrl, TO_PRL_HOLDERS);
      dailyHoldersRevenue.add(stablex, fees * shares.sPrl, holdersLabel);
    }
  }

  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "Fees paid by PAR and paUSD borrowers in the Classic Vaults: the borrowing fee (interest), the 0.2% origination fee and the liquidation fee, all added to the vaults' debt. Measured as the change in the income accrued by each VaultsCore (the debt above the PAR or paUSD the core minted, as VaultsCoreState.availableIncome() computes it, plus the interest accrued since each collateral type's last refresh), plus the income released by the FeeDistributor that day.",
  Revenue: "The fees without the Insurance Fund's 20%: the shares the FeeDistributor mints to the DAO Treasury and to the PRL stakers' payee, 80% of the fees. Revenue is protocol revenue plus holders revenue.",
  ProtocolRevenue: "The DAO Treasury's share of the fees, from the FeeDistributor's payees, without the 15% for PRL holders: 80% before that share began on 1 May 2025, 65% since. Under PGP-42, from 25 May to 1 October 2026, the Treasury received 80%, but 15% of the fees went on to PRL holders (buybacks, then September's staking rewards paid by hand), so 65% is counted here.",
  SupplySideRevenue: "20% of the fees, minted by the FeeDistributor to the Insurance Fund, which covers the vaults' bad debt.",
  HoldersRevenue: "The 15% of the fees for PRL holders since 1 May 2025, 0 before, measured at the fee source as that share of the day's fees. It is passed on to PRL stakers (sPRL1, sPRL2) through the RewardMerkleDistributor, and read from the FeeDistributor's payees. Under PGP-42, from 25 May to 31 August 2026, the DAO Treasury received that 15% to buy PRL back and burn it: a buyback funded by the fees, counted here at the fee source. September 2026, paid to PRL stakers by hand by the DAO Treasury on 1 October 2026, counts as staking rewards. The buybacks the DAO Treasury pays from its own holdings are not counted.",
};

const breakdownMethodology = {
  Fees: {
    [BORROWING_FEES]: "Every fee borrowers pay, all added to the vaults' debt: the interest compounded per second on each collateral type's debt, the 0.2% origination fee on new borrows and the liquidation fee (0 on every collateral today).",
  },
  Revenue: {
    [TO_TREASURY]: "The DAO Treasury's share of the fees, without the 15% for PRL holders: 80% before 1 May 2025, 65% since.",
    [TO_PRL_HOLDERS]: "15% of the fees since 1 May 2025: passed on to PRL stakers, or spent on PRL buybacks under PGP-42 (25 May to 31 August 2026).",
  },
  ProtocolRevenue: {
    [TO_TREASURY]: "The DAO Treasury's share of the fees, without the 15% for PRL holders: 80% before 1 May 2025, 65% since, including the PGP-42 period, when the Treasury received 80% and passed 15% on to PRL holders (buybacks, then September's staking rewards).",
  },
  SupplySideRevenue: {
    [TO_INSURANCE_FUND]: "20% of the fees, minted to the Insurance Fund, which covers the vaults' bad debt.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "15% of the fees passed on to PRL stakers through the RewardMerkleDistributor, from 1 May 2025 to 24 May 2026 and since 1 October 2026, plus September 2026, which the DAO Treasury paid to them by hand on 1 October 2026.",
    [METRIC.TOKEN_BUY_BACK]: "15% of the fees sent to the DAO Treasury under PGP-42, from 25 May to 31 August 2026, to buy PRL back and burn it. Counted at the fee source; the buybacks the Treasury pays from its own holdings are not counted.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: config,
  methodology,
  breakdownMethodology,
};

export default adapter;
