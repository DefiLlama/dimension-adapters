import { Balances, ChainApi } from "@defillama/sdk";
import { BigNumber } from "bignumber.js";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { ABI, EVENT_ABI, LIQUIDITY, zeroAddress } from "./config";

const reserveContract = "0x264786EF916af64a1DB19F513F24a3681734ce92"

export const getDexResolver = async (api: ChainApi) => {
  const block = await api.getBlock()
  let address: string
  let abi: any = ABI.dexResolver;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 21041663) break;
      address = "0x7af0C11F5c787632e567e6418D74e5832d8FFd4c";
      break;

    case CHAIN.ARBITRUM:
      if (block < 286521718) break;
      address = "0x1De42938De444d376eBc298E15D21F409b946E6D";
      break;

    case CHAIN.BASE:
      if (block < 30500000) break;
      address = "0xa3B18522827491f10Fc777d00E69B3669Bf8c1f8";
      break;

    case CHAIN.POLYGON:
      if (block < 68688825) break;
      address = "0xa17798d03bB563c618b9C44cAd937340Bad99138";
      break;
  }

  return {
    getAllDexAddresses: async () => !address ? [] : api.call({ target: address, abi: abi.getAllDexAddresses }),
    getDexTokens: async (dexes: string []) => !address ? [] : api.multiCall({ calls: dexes.map(dex => ({ target: address, params: [dex] })), abi: abi.getDexTokens }),
    getDexStates: async (dexes: string []) => !address ? [] : api.multiCall({ calls: dexes.map(dex => ({ target: address, params: [dex] })), abi: abi.getDexState }),
  }
}

export const getVaultsResolver = async (api: ChainApi) => {
  // Includes smart vaults (smart col and/or smart debt)
  const block = await api.getBlock();
  let address: string | undefined;
  let abi: any = ABI.vaultResolverSmart;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 21041663) return getVaultsT1Resolver(api);
      address = "0x49290f778faAD125f2FBCDE6F09600e73bf4bBd9";
      break;

    case CHAIN.ARBITRUM:
      if (block < 286521718) return getVaultsT1Resolver(api);
      address = "0xD6373b375665DE09533478E8859BeCF12427Bb5e";
      break;

    case CHAIN.BASE:
      if (block < 25847553) return getVaultsT1Resolver(api);
      address = "0xe7A6d56346d2ab4141Fa38e1B2Bc5ff3F69333CD";
      break;

    case CHAIN.POLYGON:
      if (block < 68688825) break;
      address = "0x3c64Ec468D7f0998cB6dea05d4D8AB847573fE4D";
      break;
  }

  return {
    getAllVaultsAddresses: async () => !address ? [] : api.call({ target: address, abi: abi.getAllVaultsAddresses }),
    getVaultEntireData: async (vaults: string[]) => !address ? [] : api.multiCall({ calls: vaults.map((vault) => ({ target: address, params: [vault] })), abi: abi.getVaultEntireData }),
  };
};

export const getVaultsT1Resolver = async (api: ChainApi) => {
  const block = await api.getBlock();
  let address: string | undefined;
  let abi: any = ABI.vaultResolver_after_19992222;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 19313700) break;
      if (block < 19662786) {
        address = "0x8DD65DaDb217f73A94Efb903EB2dc7B49D97ECca";
        abi = ABI.vaultResolver_before_19992222;
      } else if (block < 19992222) {
        address = "0x93CAB6529aD849b2583EBAe32D13817A2F38cEb4";
        abi = ABI.vaultResolver_before_19992222;
      } else if (block < 20970036) {
        address = "0x56ddF84B2c94BF3361862FcEdB704C382dc4cd32";
      } else {
        address = "0x6922b85D6a7077BE56C0Ae8Cab97Ba3dc4d2E7fA"; // VaultT1Resolver compatibility
      }
      break;

    case CHAIN.ARBITRUM:
      address =
        block < 301152875
          ? "0x77648D39be25a1422467060e11E5b979463bEA3d"
          : "0xFbFC36f44B5385AC68264dc9767662d02e0412d2";
      break;

    case CHAIN.BASE:
      address =
        block < 25765353
          ? "0x94695A9d0429aD5eFec0106a467aDEaDf71762F9"
          : "0xb7AC1927a78ADCD33E5B0473c0A1DEA76ca2bff6";
      break;

    case CHAIN.POLYGON:
      if (block >= 68688825) address = "0x9edb8D8b6db9A869c3bd913E44fa416Ca7490aCA";
      break;
  }

  return {
    getVaultEntireData: async (vaults: string[]) => !address ? [] : api.multiCall({ calls: vaults.map((vault) => ({ target: address, params: [vault] })), abi: abi.getVaultEntireData }),
    getAllVaultsAddresses: async () => {
      let vaults = !address ? [] : await api.call({ target: address, abi: abi.getAllVaultsAddresses });
      if ( api.chain === CHAIN.ARBITRUM && block > 285530000 && address === "0x77648D39be25a1422467060e11E5b979463bEA3d") {
        // Skip smart vaults during time period where VaultT1Resolver compatibility was not deployed yet (no / negligible fees during that time anyway)
        vaults = vaults.filter(
          (v: any) =>
            v !== "0xeAEf563015634a9d0EE6CF1357A3b205C35e028D" &&
            v !== "0x3A0b7c8840D74D39552EF53F586dD8c3d1234C40" &&
            v !== "0x3996464c0fCCa8183e13ea5E5e74375e2c8744Dd"
        );
      }
      return vaults;
    },
  };
};

const getFluidVaultsDailyBorrowFees = async ({ fromApi, api, createBalances }: FetchOptions, logOperates: any) => {
  // Borrow fees for all normal debt vaults.
  const dailyFees = createBalances();
  const vaults: string[] = await (await getVaultsResolver(fromApi)).getAllVaultsAddresses();
  if (!vaults.length) return dailyFees

  const [vaultDatasFrom, vaultDatasTo] = await Promise.all([
    (await getVaultsResolver(fromApi)).getVaultEntireData(vaults),
    (await getVaultsResolver(api)).getVaultEntireData(vaults),
  ]);

  for (const [index, vault] of vaults.entries()) {
    if (!vault) continue;
    const vaultDataFrom = vaultDatasFrom[index];
    const vaultDataTo = vaultDatasTo[index];
    // Skip the current vault if any required data is missing
    if (!vaultDataFrom || !vaultDataTo ) continue;

    const vaultFrom = vaultDataFrom.vault;
    const vaultTo = vaultDataTo.vault;
    if (!vaultFrom || !vaultTo || vaultFrom !== vault || vaultTo !== vault) continue;

    if (
      vaultDataFrom.constantVariables?.vaultType > 0 &&
      vaultDataFrom.constantVariables?.borrowToken?.token1 != zeroAddress) {
      // Skip any smart debt vault. tracked at dex level instead.
      continue
    }

    const borrowToken =
      vaultDataFrom.constantVariables?.vaultType > 0
        ? vaultDataFrom.constantVariables.borrowToken.token0
        : vaultDataFrom.constantVariables?.borrowToken;
    if (!borrowToken) continue;

    const initialBalance = new BigNumber(vaultDataFrom.totalSupplyAndBorrow?.totalBorrowVault || "0");
    const borrowBalanceTo = new BigNumber(vaultDataTo.totalSupplyAndBorrow?.totalBorrowVault || "0");
    if (initialBalance.isZero() || borrowBalanceTo.isZero()) continue;

    const liquidityLogs = logOperates.filter((log: any) => log[0] == vault && log[1] == borrowToken && log[5] !== reserveContract);
    const borrowBalances = liquidityLogs.reduce((balance: BigNumber, [, , , amount]) => balance.plus(new BigNumber(amount || "0")),initialBalance);
    const fees = borrowBalanceTo.minus(borrowBalances);
    const safeFees = fees.isPositive() ? fees : new BigNumber(0);
    dailyFees.add(borrowToken, safeFees);
  }
  return dailyFees
}

const getFluidDexesDailyBorrowFees = async ({ fromApi, api, createBalances }: FetchOptions, liquidityOperateLogs: any[]): Promise<Balances> => {
  // Borrow fees for all dexes that have smart debt pool enabled (covers smart debt vaults).
  const dailyFees = createBalances()
  const dexes: string[] = await (await getDexResolver(fromApi)).getAllDexAddresses();
  if (!dexes.length) return dailyFees

  const [dexStatesFrom, dexStatesTo, dexTokens] = await Promise.all([
    (await getDexResolver(fromApi)).getDexStates(dexes),
    (await getDexResolver(api)).getDexStates(dexes),
    (await getDexResolver(fromApi)).getDexTokens(dexes),
  ]);

  for (const [index, dex] of dexes.entries()) {
    if (!dex) continue
    const dexStateFrom = dexStatesFrom[index];
    const dexStateTo = dexStatesTo[index];
    const tokensInfo = dexTokens[index];

    const token0 = tokensInfo?.token0_
    const token1 = tokensInfo?.token1_
    if (!dexStateFrom || !dexStateTo || !token0 || !token1) continue;

    const initialBorrowShares = new BigNumber(dexStateFrom?.totalBorrowShares || "0");
    const finalBorrowShares = new BigNumber(dexStateTo?.totalBorrowShares || "0");
    if (initialBorrowShares.isZero() || finalBorrowShares.isZero()) continue;


    const token0PerBorrowShareFrom = new BigNumber(dexStateFrom?.token0PerBorrowShare || "0");
    const token1PerBorrowShareFrom = new BigNumber(dexStateFrom?.token1PerBorrowShare || "0");

    const token0PerBorrowShareTo = new BigNumber(dexStateTo?.token0PerBorrowShare || "0");
    const token1PerBorrowShareTo = new BigNumber(dexStateTo?.token1PerBorrowShare || "0");

    const initialBalance0 = initialBorrowShares.multipliedBy(token0PerBorrowShareFrom).div(1e18);
    const initialBalance1 = initialBorrowShares.multipliedBy(token1PerBorrowShareFrom).div(1e18);
    const finalBalance0 = finalBorrowShares.multipliedBy(token0PerBorrowShareTo).div(1e18);
    const finalBalance1 = finalBorrowShares.multipliedBy(token1PerBorrowShareTo).div(1e18);

    const dexLogs = liquidityOperateLogs.filter((log) => log[0] == dex);
    const dexLogs0 = dexLogs.filter((log) => log[1] == token0 && log[5] !== reserveContract);
    const dexLogs1 = dexLogs.filter((log) => log[1] == token1 && log[5] !== reserveContract);

    const borrowBalance0 = dexLogs0.reduce((balance, [, , , amount]) => balance.plus(new BigNumber(amount || "0")), initialBalance0);
    const borrowBalance1 = dexLogs1.reduce((balance, [, , , amount]) => balance.plus(new BigNumber(amount || "0")), initialBalance1);

    const fees0 = finalBalance0.minus(borrowBalance0);
    const fees1 = finalBalance1.minus(borrowBalance1);

    const safeFees0 = fees0.isPositive() ? fees0 : new BigNumber(0);
    const safeFees1 = fees1.isPositive() ? fees1 : new BigNumber(0);

    const safeFees0Int = safeFees0.integerValue(BigNumber.ROUND_FLOOR);
    const safeFees1Int = safeFees1.integerValue(BigNumber.ROUND_FLOOR);

    dailyFees.add(token0, safeFees0Int);
    dailyFees.add(token1, safeFees1Int);

    const supplyShares = new BigNumber(dexStateFrom?.totalSupplyShares || "0");
    if (supplyShares.gt(0)) {
    // If the dex has both col pool and debt pool enabled, there can be internal arbitrage fees
    // Filter events for arb logs: both supply and borrow amount must be + (deposit and borrow) or - (payback and withdraw)
      const arbLogs = dexLogs.filter((log) => {
        const supplyAmt = new BigNumber(log[2] || "0");
        const borrowAmt = new BigNumber(log[3] || "0");
        const bothPositive = supplyAmt.gt(0) && borrowAmt.gt(0);
        const bothNegative = supplyAmt.lt(0) && borrowAmt.lt(0);
        return ((bothPositive || bothNegative) && !supplyAmt.eq(borrowAmt));
      });

      // Abs diff is arb amount. = fee
      const arbs0 = arbLogs
        .filter((log) => log[1] === token0)
        .reduce((acc, log) => {
          const supplyAmt = new BigNumber(log[2] || "0");
          const borrowAmt = new BigNumber(log[3] || "0");
          return acc.plus(supplyAmt.minus(borrowAmt).abs());
        }, new BigNumber(0));

      const arbs1 = arbLogs
        .filter((log) => log[1] === token1)
        .reduce((acc, log) => {
          const supplyAmt = new BigNumber(log[2] || "0");
          const borrowAmt = new BigNumber(log[3] || "0");
          return acc.plus(supplyAmt.minus(borrowAmt).abs());
        }, new BigNumber(0));

      const safeArbs0 = arbs0.isPositive() ? arbs0 : new BigNumber(0);
      const safeArbs1 = arbs1.isPositive() ? arbs1 : new BigNumber(0);

      const safeArbs0Int = safeArbs0.integerValue(BigNumber.ROUND_FLOOR);
      const safeArbs1Int = safeArbs1.integerValue(BigNumber.ROUND_FLOOR);

      dailyFees.add(token0, safeArbs0Int);
      dailyFees.add(token1, safeArbs1Int);
    }
  }

  return dailyFees
}

export const getFluidDailyFees = async (options: FetchOptions): Promise<Balances> => {
  const dailyFees = options.createBalances()

  // fetch all operate logs at liquidity layer at once
  const liquidityOperateLogs = await options.getLogs({
    target: LIQUIDITY,
    onlyArgs: true,
    eventAbi: EVENT_ABI.logOperate,
    fromBlock: Number(options.fromApi.block),
    toBlock: Number(options.api.block),
    skipCacheRead: true,
    skipIndexer: true
    // More resource-intensive but prevents logs from being cached.
    // Currently, the adapter is updated every hour.
    // In case of an error within a given time range for some reasons, the next sequence
    // can likely fix the issue naturally if it retries fetching all the logs
  })

  if (!liquidityOperateLogs?.length) return dailyFees;

  const [vaultFees, dexFees] = await Promise.all([
    getFluidVaultsDailyBorrowFees(options, liquidityOperateLogs),
    getFluidDexesDailyBorrowFees(options, liquidityOperateLogs),
  ])

  dailyFees.addBalances(vaultFees, METRIC.BORROW_INTEREST)
  dailyFees.addBalances(dexFees, METRIC.BORROW_INTEREST)
  return dailyFees
}