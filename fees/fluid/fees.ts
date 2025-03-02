import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, EVENT_ABI, LIQUIDITY, parseInTopic, TOPIC0 } from "./config";

const reserveContract = "0x264786EF916af64a1DB19F513F24a3681734ce92"

export const getDexResolver = async (api: ChainApi) => {
  const block = await api.getBlock()

  let address: string
  let abi: any = ABI.dexResolver;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 21041663) {
        break;
      }
      address = "0x7af0C11F5c787632e567e6418D74e5832d8FFd4c";
      break;

    case CHAIN.ARBITRUM:
      if (block < 286521718) {
        break;
      }
      address = "0x1De42938De444d376eBc298E15D21F409b946E6D";
      break;

    case CHAIN.BASE:
      if (block < 25847553) {
        break;
      }
      address = "0x800104086BECa15A54e8c61dC1b419855fdA3377";
      break;
  }

  return {
    getAllDexAddresses: async () => !address ? [] : api.call({ target: address, abi: abi.getAllDexAddresses }),
    getDexTokens: async (dexes: string []) => api.multiCall({ calls: dexes.map(dex => ({ target: address, params: [dex] })), abi: abi.getDexTokens }),
    getDexStates: async (dexes: string []) => api.multiCall({ calls: dexes.map(dex => ({ target: address, params: [dex] })), abi: abi.getDexState }),
  }
}

export const getVaultsResolver = async (api: ChainApi) => {
  // includes smart vaults (smart col and/or smart debt)
  const block = await api.getBlock()

  let address: string
  let abi: any = ABI.vaultResolverSmart;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 21041663) {
        return getVaultsT1Resolver(api);
      }

      address = "0x49290f778faAD125f2FBCDE6F09600e73bf4bBd9";
      break;

    case CHAIN.ARBITRUM:
      if (block < 286521718) {
        return getVaultsT1Resolver(api);
      }

      address = "0xD6373b375665DE09533478E8859BeCF12427Bb5e";
      break;

    case CHAIN.BASE:
      if (block < 25847553) {
        return getVaultsT1Resolver(api);
      }

      address = "0xe7A6d56346d2ab4141Fa38e1B2Bc5ff3F69333CD";
      break;
  }

  return {
    getAllVaultsAddresses: async () => api.call({ target: address, abi: abi.getAllVaultsAddresses }),
    getVaultEntireData: async (vaults: string []) => api.multiCall({ calls: vaults.map((vault) => ({ target: address, params: [vault] })), abi: abi.getVaultEntireData })
  }
}

export const getVaultsT1Resolver = async (api: ChainApi) => {
  const block = await api.getBlock()
  let address: string
  let abi: any = ABI.vaultResolver_after_19992222

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 19313700) {
        // vault resolver related revenue only exists after this block. revenue / fees before are negligible
        break
      }

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
      if (block < 301152875) {
        address = "0x77648D39be25a1422467060e11E5b979463bEA3d";
      } else {
        address = "0xFbFC36f44B5385AC68264dc9767662d02e0412d2"; // VaultT1Resolver compatibility
      }
      break;

    case CHAIN.BASE:
      if (block < 25765353) {
        address = "0x94695A9d0429aD5eFec0106a467aDEaDf71762F9";
      } else {
        address = "0xb7AC1927a78ADCD33E5B0473c0A1DEA76ca2bff6"; // VaultT1Resolver compatibility
      }
      break;
  }

  return {
    getAllVaultsAddresses: async () => api.call({ target: address, abi: abi.getAllVaultsAddresses }),
    getVaultEntireData: async (vaults: string []) => {
      return api.multiCall({ calls: vaults.map((vault) => ({ target: address, params: [vault] })), abi: abi.getVaultEntireData });
    }
  }
}

export const getFluidDexesDailyBorrowFees = async ({ fromApi, toApi, createBalances }: FetchOptions, liquidityOperateLogs: any[]) => {
  // borrow fees for all dexes that have smart debt pool enabled (covers smart debt vaults).
  const dailyFees = createBalances();
  const dexes: string[] = await (await getDexResolver(fromApi)).getAllDexAddresses();

  if(!dexes.length){
    return dailyFees;
  }

  const [dexStatesFrom, dexStatesTo, dexTokens] = await Promise.all([
    (await getDexResolver(fromApi)).getDexStates(dexes),
    (await getDexResolver(toApi)).getDexStates(dexes),
    (await getDexResolver(fromApi)).getDexTokens(dexes),
  ]);

  for (const [i, dex] of dexes.entries()) {
    const dexStateFrom = dexStatesFrom[i];
    const dexStateTo = dexStatesTo[i];
    const borrowToken0 = dexTokens[i].token0_;
    const borrowToken1 = dexTokens[i].token1_;

    // Skip the current dex if any required data is missing
    if (!dexStateFrom || !dexStateTo || !borrowToken0 || !borrowToken1) continue;

    const initialShares = Number(dexStateFrom.totalBorrowShares);
    if (!initialShares || initialShares == 0) continue;
    const initialBalance0 = initialShares * Number(dexStateFrom.token0PerBorrowShare) / 1e18;
    const initialBalance1 = initialShares * Number(dexStateFrom.token1PerBorrowShare) / 1e18;

    const borrowBalanceTo0 = Number(dexStateTo.totalBorrowShares) * Number(dexStateTo.token0PerBorrowShare) / 1e18;
    const borrowBalanceTo1 = Number(dexStateTo.totalBorrowShares) * Number(dexStateTo.token1PerBorrowShare) / 1e18;

    const liquidityLogs = liquidityOperateLogs.filter(log => log[0] == dex);

    const liquidityLogs0 = liquidityLogs.filter(log => log[1] == borrowToken0);
    const liquidityLogs1 = liquidityLogs.filter(log => log[1] == borrowToken1);

    const borrowBalances0 = liquidityLogs0
      .filter((log) => log[5] !== reserveContract)
      .reduce((balance, [, , , amount]) => balance + Number(amount) , initialBalance0)
    const borrowBalances1 = liquidityLogs1
      .filter((log) => log[5] !== reserveContract)
      .reduce((balance, [, , , amount]) => balance + Number(amount) , initialBalance1)

    const fees0 = borrowBalanceTo0 > borrowBalances0 ? borrowBalanceTo0 - borrowBalances0 : 0n
    const fees1 = borrowBalanceTo1 > borrowBalances1 ? borrowBalanceTo1 - borrowBalances1 : 0n

    console.log("dex", i, dex)
    
    let valuesBefore = await dailyFees.getUSDValue();

    dailyFees.add(borrowToken0, fees0)

    let valuesAfter =  await dailyFees.getUSDValue();
    console.log((valuesAfter - valuesBefore).toString(), "added fees0");

     valuesBefore = await dailyFees.getUSDValue();

    dailyFees.add(borrowToken1, fees1)

     valuesAfter =  await dailyFees.getUSDValue();
     console.log((valuesAfter - valuesBefore).toString(), "added fees1");

    if (!dexStateFrom.totalSupplyShares || Number(dexStateFrom.totalSupplyShares) == 0) continue;

    // if the dex has both col pool and debt pool enabled, there can be internal arbitrage fees
    // filter events for arb logs: both supply and borrow amount must be + (deposit and borrow) or - (payback and withdraw)
    const arbLogs = liquidityLogs.filter((log) => ((log[2] > 0 && log[3] > 0) || (log[2] < 0 && log[3] < 0)) && (log[2] != log[3]));

    // abs diff is arb amount. = fee
    const arbs0 = arbLogs
      .filter((log) => log[1] == borrowToken0)
      .reduce((balance, [, , supplyAmount, borrowAmount]) => balance + Math.abs(Number(supplyAmount) - Number(borrowAmount)) , 0);
    const arbs1 = arbLogs
      .filter((log) => log[1] == borrowToken1)
      .reduce((balance, [, , supplyAmount, borrowAmount]) => balance + Math.abs(Number(supplyAmount) - Number(borrowAmount)) , 0);

      valuesBefore = await dailyFees.getUSDValue();

      dailyFees.add(borrowToken0, arbs0)
  
       valuesAfter =  await dailyFees.getUSDValue();
      console.log((valuesAfter - valuesBefore).toString(), "added arbs0");
  
       valuesBefore = await dailyFees.getUSDValue();
  
       dailyFees.add(borrowToken1, arbs1)
  
       valuesAfter =  await dailyFees.getUSDValue();
       console.log((valuesAfter - valuesBefore).toString(), "added arbs1");
  }

  return dailyFees;
}

export const getFluidVaultsDailyBorrowFees = async ({ fromApi, toApi, createBalances }: FetchOptions, liquidityOperateLogs: any[]) => {
  // borrow fees for all normal debt vaults.
  const dailyFees = createBalances();
  const vaults: string[] = await (await getVaultsResolver(fromApi)).getAllVaultsAddresses();

  const [vaultDatasFrom, vaultDatasTo] = await Promise.all([
    (await getVaultsResolver(fromApi)).getVaultEntireData(vaults),
    (await getVaultsResolver(toApi)).getVaultEntireData(vaults),
  ]);

  console.log("\n\n------------------ chain", fromApi.chain, "---------------------");

  for (const [i, vault] of vaults.entries()) {
    const vaultDataFrom = vaultDatasFrom[i];
    const vaultDataTo = vaultDatasTo[i];
    // Skip the current vault if any required data is missing
    if (!vaultDataFrom || !vaultDataTo ) continue;

    const vaultFrom = vaultDataFrom.vault
    const vaultTo = vaultDataTo.vault

    if (!vaultFrom || !vaultTo || vaultFrom !== vault || vaultTo !== vault){
      console.log("Skip any not set");
      continue;
    } 

    if(vaultDataFrom.constantVariables.vaultType > 0 && vaultDataFrom.constantVariables.borrowToken.token1 != "0x0000000000000000000000000000000000000000"){
      // skip any smart debt vault. tracked at dex level instead.
      console.log("Skip smart debt vault", vault, vaultDataFrom.constantVariables.vaultType, vaultDataFrom.constantVariables.borrowToken);
      continue;
    }

    const borrowToken = vaultDataFrom.constantVariables.vaultType > 0 ? vaultDataFrom.constantVariables.borrowToken.token0 : vaultDataFrom.constantVariables.borrowToken;
    if (!borrowToken){
      console.log("Skip fail borrow token", vault, borrowToken);
      continue;
    }

    console.log("vault", vault)
    console.log("borrowToken", borrowToken)

    const { totalSupplyAndBorrow: totalSupplyAndBorrowFrom } = vaultDataFrom;
    const { totalSupplyAndBorrow: totalSupplyAndBorrowTo } = vaultDataTo;

    const initialBalance = Number(totalSupplyAndBorrowFrom.totalBorrowVault);

    console.log("initialBalance", initialBalance.toString())
    const borrowBalanceTo = Number(totalSupplyAndBorrowTo.totalBorrowVault);

    console.log("borrowBalanceTo", borrowBalanceTo.toString())

    const liquidityLogs = liquidityOperateLogs.filter(log => (log[0] == vault && log[1] == borrowToken));
    
    console.log("liquidityLogs", liquidityLogs.length)

    const borrowBalances = liquidityLogs
      .filter((log) => log[5] !== reserveContract)
      .reduce((balance, [, , , amount]) => balance + Number(amount) , initialBalance)

   console.log("reduced borrowBalances", borrowBalances.toString())
    
    const fees = borrowBalanceTo > borrowBalances ? borrowBalanceTo - borrowBalances : 0n

    console.log("fees", fees.toString())

    let valuesBefore = await dailyFees.getUSDValue();

    dailyFees.add(borrowToken, fees)

    let valuesAfter =  await dailyFees.getUSDValue();

     console.log((valuesAfter - valuesBefore).toString(), "added vault fees");
  }

  return dailyFees;
};

export const getFluidDailyFees = async (options: FetchOptions) => {
  // fetch all operate logs at liquidity layer at once
  const liquidityOperateLogs = await options.getLogs({
    target: LIQUIDITY,
    onlyArgs: true,
    topics: [TOPIC0.logOperate],
    eventAbi: EVENT_ABI.logOperate});

  const [vaultFees, dexFees] = await Promise.all([
    await getFluidVaultsDailyBorrowFees(options, liquidityOperateLogs),
    await getFluidDexesDailyBorrowFees(options, liquidityOperateLogs),
  ]);

  console.log("vaultFees", (await vaultFees.getUSDValue()).toString())
  console.log("dexFees", (await dexFees.getUSDValue()).toString())

  vaultFees.addBalances(dexFees);
  return vaultFees;
};
