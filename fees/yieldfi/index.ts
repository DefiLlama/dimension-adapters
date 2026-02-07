import { CHAIN } from "../../helpers/chains";
import {
 FetchOptions,
 FetchResultV2,
 SimpleAdapter,
} from "../../adapters/types";
import { ethers } from "ethers";
import { Balances } from "@defillama/sdk";


const decimal_map = {
 "0x1e2a5622178f93efd4349e2eb3dbdf2761749e1b": 8, // vyBTC
 "0x3073112c2c4800b89764973d5790ccc7fba5c9f9": 18, // vyETH
 "0xa01200b2e74de6489cf56864e3d76bbc06fc6c43": 8, // yBTC
 "0x8464f6ecae1ea58ec816c13f964030eab8ec123a": 18, // yETH
 '0xdd5eff0756db08bad0ff16b66f88f506e7318894': 18, // yPRISM
};

const getDecimals = (address: string) => {
  if (decimal_map[address.toLowerCase()]) {
    return decimal_map[address.toLowerCase()];
  }
  return 18;
};

const YPRISM_TOKEN = "0xDd5eff0756DB08BAD0Ff16b66f88F506e7318894";




const NAV_ABI =
 "event NAVUpdated(address indexed vault, uint256 indexed newNav, uint256 vestingEndTime, uint256 managementFee, uint256 performanceFee)";
const NAV_ABI_2 =
 "event NAVUpdated(address indexed vault,uint256 oldNav,uint256 newNav,uint256 vestingEndTime)";


const NAV_MANAGER: Record<string, string> = {
 [CHAIN.ETHEREUM]: "0x08fB9833A5a84d5bCEcDF5a4a635d33260C5F05C",
 [CHAIN.BSC]: "0x08fB9833A5a84d5bCEcDF5a4a635d33260C5F05C",
};


const NAV_PROXY: Record<string, string> = {
 [CHAIN.ETHEREUM]: "0x95178e55fE7edD0792b9819B7654C9Ee076832fa",
 [CHAIN.BSC]: "0x95178e55fE7edD0792b9819B7654C9Ee076832fa",
};


const V2_YIELD_PROXY_ABI =
 "event DistributeYield(address caller, address indexed asset, address indexed receiver, uint256 amount, bool profit)";


const V2_ASSET_SHARED_ABI =
 "event AssetAndShareManaged(address indexed caller,address indexed yToken,uint256 shares,uint256 assetAmount,bool updateAsset,bool isMint,bool isNewYToken)";


const V2_YIELD_PROXY: Record<string, string> = {
 [CHAIN.ETHEREUM]: "0x392017161a9507F19644E8886A237C58809212B5",
};


const V2_MANAGER: Record<string, string> = {
 [CHAIN.ETHEREUM]: "0x03ACc35286bAAE6D73d99a9f14Ef13752208C8dC",
};


const fetchV2 = async (
 options: FetchOptions,
 fromBlock: number,
 toBlock: number,
 dailyFees: Balances,
 dailyRevenue: Balances
): Promise<{ dailyFees: Balances; dailyRevenue: Balances }> => {


 if(!V2_YIELD_PROXY[options.chain]) {
   return { dailyFees, dailyRevenue };
 }
  const distributeYieldLogs = await options // gives yield
   .getLogs({
     target: V2_YIELD_PROXY[options.chain],
     eventAbi: V2_YIELD_PROXY_ABI,
     fromBlock,
     toBlock,
   })
   .catch(() => []);


 const v2AssetSharedLogs = await options.getLogs({
   // gives fees
   target: V2_MANAGER[options.chain],
   eventAbi: V2_ASSET_SHARED_ABI,
   fromBlock,
   toBlock,
 });


 if (Array.isArray(distributeYieldLogs) && distributeYieldLogs.length > 0) {
   const assetAmounts: Record<string, bigint> = {};


   distributeYieldLogs.forEach((log: any) => {
     if (!log || !log.asset || log.amount === undefined) return;


     const receiver = log.receiver.toLowerCase();
     const amount = BigInt(log.amount || 0); // yield
     const profit = log.profit || false;


     if (amount > BigInt(0) && profit) {
       assetAmounts[receiver] = (assetAmounts[receiver] || BigInt(0)) + amount;
     }
   });


   for (const [yToken, yieldAmount] of Object.entries(assetAmounts)) {
     dailyFees.add(yToken, yieldAmount);
   }
 }


 if (Array.isArray(v2AssetSharedLogs) && v2AssetSharedLogs.length > 0) {
   const assetAmounts: Record<string, bigint> = {};


   v2AssetSharedLogs.forEach((log: any) => {
     if (!log || !log.yToken || log.assetAmount === undefined) return;


     const yToken = log.yToken.toLowerCase();
     const assetAmount = BigInt(log.assetAmount || 0);


     assetAmounts[yToken] = (assetAmounts[yToken] || BigInt(0)) + assetAmount;
   });


   for (const [yToken, totalAmount] of Object.entries(assetAmounts)) {
     dailyFees.add(yToken, totalAmount);
     dailyRevenue.add(yToken, totalAmount);
   }
 }
 return { dailyFees, dailyRevenue };
};


const fetchV3 = async (
 options: FetchOptions,
 fromBlock: number,
 toBlock: number,
 dailyFees: Balances,
 dailyRevenue: Balances
): Promise<{ dailyFees: Balances; dailyRevenue: Balances }> => {
  if(!NAV_MANAGER[options.chain]) {
   return { dailyFees, dailyRevenue };
 }
  const navManagerLogs = await options.getLogs({
   target: NAV_MANAGER[options.chain],
   eventAbi: NAV_ABI,
   fromBlock,
   toBlock,
 });


 const navManagerLogs2Raw = await options.getLogs({
   target: NAV_PROXY[options.chain],
   eventAbi: NAV_ABI_2,
   fromBlock,
   toBlock,
   entireLog: true,
 });


 const navInterface = new ethers.Interface([NAV_ABI_2]);
 const navManagerLogs2 = navManagerLogs2Raw.map((log: any) => {
   const parsed = navInterface.parseLog(log);
   return {
     blockNumber: Number(log.blockNumber),
     vault: parsed?.args.vault,
     oldNav: parsed?.args.oldNav,
     newNav: parsed?.args.newNav,
     vestingEndTime: parsed?.args.vestingEndTime,
   };
 });


 if (Array.isArray(navManagerLogs) && navManagerLogs.length > 0) {
   const navAmounts: Record<string, bigint> = {};


   navManagerLogs.forEach((log: any) => {
     if (!log || !log.vault || log.newNav === undefined) return;


     const vault = log.vault.toLowerCase();
     const performanceFee = BigInt(log.performanceFee || 0);
     const managementFee = BigInt(log.managementFee || 0);


     navAmounts[vault] = performanceFee + managementFee;
   });


   // added fee
   for (const [vault, totalAmount] of Object.entries(navAmounts)) {
     dailyFees.add(vault, totalAmount);
     dailyRevenue.add(vault, totalAmount);
   }
 }


 if (Array.isArray(navManagerLogs2) && navManagerLogs2.length > 0) {
   const navAmounts: Record<string, bigint> = {};


   for (const log of navManagerLogs2) {
     if (!log || !log.vault || log.newNav === undefined) continue;


     const vault = log.vault.toLowerCase();
     const oldNav = BigInt(log.oldNav || 0);
     const newNav = BigInt(log.newNav || 0);


     let totalSupply = await options.api.call({
       abi: 'uint256:totalSupply',
       target: vault,
       block: log.blockNumber,
       chain: options.chain,
     });


     totalSupply = BigInt(totalSupply);


     const growthRate = (newNav - oldNav);
     let growthRateInteger: any = ethers.formatUnits(growthRate, getDecimals(vault));
     growthRateInteger = formatNumber(growthRateInteger);
     let totalSupplyInteger: any = ethers.formatUnits(totalSupply, getDecimals(vault));
     totalSupplyInteger = formatNumber(totalSupplyInteger);


     const yieldAmount = (growthRateInteger) * totalSupplyInteger;
     navAmounts[vault] = ethers.parseUnits(yieldAmount.toString(), getDecimals(vault));
   }


   for (const [vault, totalAmount] of Object.entries(navAmounts)) {
     dailyFees.add(vault, totalAmount);
   }
 }


 return { dailyFees: dailyFees, dailyRevenue: dailyRevenue };
};


const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
 const dailyFees = options.createBalances();
 const dailyRevenue = options.createBalances();
 const fromBlock = await options.getStartBlock();
 const toBlock = await options.getEndBlock();


 const { dailyFees: v2DailyFees, dailyRevenue: v2DailyRevenue } =
   await fetchV2(options, fromBlock, toBlock, dailyFees, dailyRevenue);


 const { dailyFees: v3DailyFees, dailyRevenue: v3DailyRevenue } =
   await fetchV3(options, fromBlock, toBlock, dailyFees, dailyRevenue);


 dailyFees.addBalances(v2DailyFees);
 dailyRevenue.addBalances(v2DailyRevenue);
 dailyFees.addBalances(v3DailyFees);
 dailyRevenue.addBalances(v3DailyRevenue);


 const dailySupplySideRevenue = dailyFees.clone(1);
 dailySupplySideRevenue.subtract(dailyRevenue);


 return {
   dailyFees,
   dailyRevenue,
   dailyProtocolRevenue: dailyRevenue,
   dailySupplySideRevenue,
 };
};


const formatNumber = (number: string) => {
 const [integer, decimal] = number.split(".");
 if (decimal && decimal.length > 15) {
   return Number(`${integer}.${decimal.slice(0, 15)}`);
 }
 return Number(number);
};


const methodology = {
 Fees: "Total yield generated by YieldFi across all supported chains + management fees by YieldFi",
 Revenue: "Total management fees by YieldFi.",
 ProtocolRevenue: "Total management fees by YieldFi.",
 SupplySideRevenue:
   "Total yield generated and distributed to vaults depositors.",
};


const adapter: SimpleAdapter = {
   version: 2,
   fetch,
   methodology,
   adapter: {
       [CHAIN.ETHEREUM]: {
           start: '2024-11-11',
       },
       [CHAIN.OPTIMISM]: {
           start: '2025-04-30',
       },
       [CHAIN.ARBITRUM]: {
           start: '2025-04-30',
       },
       [CHAIN.BASE]: {
           start: '2025-04-30',
       },
       [CHAIN.SONIC]: {
           start: '2025-05-09',
       },
       [CHAIN.PLUME]: {
           start: '2025-06-10',
       },
       [CHAIN.KATANA]: {
           start: '2025-07-31',
       },
       [CHAIN.BSC]: {
           start: '2025-07-27',
       },
       [CHAIN.AVAX]: {
           start: '2025-07-31',
       },
       [CHAIN.TAC]: {
           start: '2025-07-17',
       },
       [CHAIN.PLASMA]: {
           start: '2025-09-30',
       }
   },
};


export default adapter;


