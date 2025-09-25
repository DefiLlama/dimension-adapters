import ADDRESSES from '../helpers/coreAssets.json'
import { Interface } from "ethers";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
/**
 *
 * Usual takes RWA stablecoins from users and issue USD0 stablecoins
 * Users can stake USD0, receive USD0++ and earn USUAL tokens
 * Users can stake USUAL, receive USUALx and earn USIAL tokens
 *
 * There are fours places where Usual takes fees:
 * 1. Usual earns fees from locked RWA assets
 * 2. When users redeem USD0 stablecoins, Usual takes an amount of redemption fees in USD0 tokens
 * 3. When users early unstake USD0++ at floor price
 * 4. When users early unstake USD0++, users must commit an amount of USUAL tokens
 *    these USUAL tokens then are burnt and distributed to USUALx stakers
 *
 * So:
 * We count 1, 2, 3 as protocol revenue
 * We count 4 as holder revenue
 *
 * There is no source of revenue for supply side users - USD0 minters.
 * Rewarded USUAL tokens to USD0++ and USUALx stakers are incentive from Usual, not from RWA assets yield.
 *
 */

const methodology = {
  Fees: 'Total USD0 redemption fees and USD0++ early unstake fees.',
  ProtocolRevenue: 'Total fees are distributed to protocol treasury.',
  HoldersRevenue: 'Total fees are distributed to token holders.',
}

const DaoCollateral = '0xde6e1F680C4816446C8D515989E2358636A38b04'
const Treasury = '0xdd82875f0840AAD58a455A70B88eEd9F59ceC7c7'
const USD0 = ADDRESSES.ethereum.USD0
const USUAL = '0xc4441c2be5d8fa8126822b9929ca0b81ea0de38e'
const USD0PP = '0x35d8949372d46b7a3d5a56006ae77b215fc69bc0'

const USYC = "0x136471a34f6ef19fe571effc1ca711fdb8e49f2b";
const USYCOracle = "0x4c48bcb2160F8e0aDbf9D4F3B034f1e36d1f8b3e";
const wM = "0x437cc33344a0B27A429f795ff6B469C72698B291";
const USUAL_wM = "0x4Cbc25559DbBD1272EC5B64c7b5F48a2405e6470";

const USUAL_USDtB = "0x58073531a2809744d1bf311d30fd76b27d662abb";
const USDtB = "0xC139190F447e929f090Edeb554D95AbB8b18aC1C";
const USDtBOracle = "0xd96f2ad5f40fce3fffa7a06e7d7ac5bacfd8e987";

const eUSD04 = "0xd001f0a15d272542687b2677ba627f48a4333b5d";
const eUSD0Oracle = "0xe1dee60c516a8350704ec24a6e856c9f533d1c1b";

const ContractAbis = {
  // USYC
  balanceOf: "function balanceOf(address) view returns (uint256 balance)",
  oraclePrice:
    "function latestRoundData() view returns(uint80 roundId, int256 answer, uint256 startAt, uint256 updatedAt, uint80 answeredInRound)",
  Usd0ppFloorPrice: "function getFloorPrice() view returns (uint256)",
  // wM
  currentIndex: "uint256:currentIndex",

  // users redeem USD0 to RWA stablecoins
  RedeemEvent:
    "event Redeem(address indexed redeemer, address indexed rwaToken, uint256 amountRedeemed, uint256 returnedRwaAmount, uint256 stableFeeAmount)",

  // collect USUAL paid by early unstake USD0++ users
  FeeSweptEvent:
    "event FeeSwept(address indexed caller, address indexed collector, uint256 amount)",

  // collect USD0 fees to treasury
  Usd0ppUnlockedFloorPriceEvent:
    "event Usd0ppUnlockedFloorPrice(address indexed user, uint256 usd0ppAmount, uint256 usd0Amount)",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const redeemEvents: Array<any> = await options.getLogs({
    target: DaoCollateral,
    eventAbi: ContractAbis.RedeemEvent,
  });
  // get vaults rate updateed events
  const usd0ppContract: Interface = new Interface([
    ContractAbis.Usd0ppUnlockedFloorPriceEvent,
    ContractAbis.RedeemEvent,
    ContractAbis.FeeSweptEvent,
    ContractAbis.Usd0ppFloorPrice,
  ]);
  const feeSweptEvents: Array<any> = (
    await options.getLogs({
      target: USD0PP,
      eventAbi: ContractAbis.FeeSweptEvent,
      entireLog: true,
    })
  ).map((log) => {
    const decodeLog: any = usd0ppContract.parseLog(log);
    const event: any = {
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      blockHash: log.blockHash,
      caller: decodeLog.args[0],
      collector: decodeLog.args[1],
      amount: decodeLog.args[2],
    };

    return event;
  });

  const usd0ppUnlockedFloorPriceEvents: Array<any> = (
    await options.getLogs({
      target: USD0PP,
      eventAbi: ContractAbis.Usd0ppUnlockedFloorPriceEvent,
      entireLog: true,
    })
  ).map((log) => {
    const decodeLog: any = usd0ppContract.parseLog(log);

    const event: any = {
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      blockHash: log.blockHash,
      user: decodeLog.args[0],
      usd0ppAmount: decodeLog.args[1],
      usd0Amount: decodeLog.args[2],
    };

    return event;
  });

  for (const event of redeemEvents) {
    dailyFees.add(USD0, Number(event.stableFeeAmount));
    console.log("Redeem USD0 fee amount:", event.stableFeeAmount);
    dailyProtocolRevenue.add(USD0, Number(event.stableFeeAmount));
  }
  let res = await dailyFees.getUSDValue();
  console.log("===============AFTER Redeem USD0 fee amount:", res);
  for (const event of feeSweptEvents) {
    console.log("USUAL fee swept:", event.amount);
    dailyFees.add(USUAL, Number(event.amount));
    console.log("feeSweptEvents  event:", event);
    // https://docs.usual.money/usual-products/usd0-liquid-staking-token/usd0++-early-redemption-mechanism#how-does-it-work
    const floorPrice = await sdk.api2.abi.call({
      abi: ContractAbis.Usd0ppFloorPrice,
      target: USD0PP,
      block: event.blockNumber,
    });
    const forHolders = Number(event.amount) * Number(floorPrice / 1e18);
    dailyHoldersRevenue.add(USUAL, forHolders);
  }
  res = await dailyFees.getUSDValue();
  console.log("===============AFTER USUAL fee swept:", res);
  for (const event of usd0ppUnlockedFloorPriceEvents) {
    const feeAmount = Number(event.usd0ppAmount) - Number(event.usd0Amount);
    const floorPrice = await sdk.api2.abi.call({
      abi: ContractAbis.Usd0ppFloorPrice,
      target: USD0PP,
      block: event.blockNumber,
    });
    console.log("floorPrice:", Number(floorPrice / 1e18));
    dailyFees.add(USD0, feeAmount);
    dailyProtocolRevenue.add(USD0, feeAmount);
  }
  res = await dailyFees.getUSDValue();
  console.log("===============AFTER usd0ppUnlocked:", res);

  // get fees earned by USYC
  const usycBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: USYC,
    params: [Treasury],
  });
  const [, oldPrice, , ,] = await options.fromApi.call({
    abi: ContractAbis.oraclePrice,
    target: USYCOracle,
  });
  const [, newPrice, , ,] = await options.toApi.call({
    abi: ContractAbis.oraclePrice,
    target: USYCOracle,
  });
  // price decimals: 8, USYC decimals: 6
  const usycYield =
    ((Number(newPrice) - Number(oldPrice)) * usycBalance) / 1e14;

  // get fees earned by wM
  const wMBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: wM,
    params: [USUAL_wM],
  });
  console.log("===============wMBalance:", wMBalance);
  const oldIndex = await options.fromApi.call({
    abi: ContractAbis.currentIndex,
    target: wM,
  });
  console.log("===============oldIndex:", oldIndex);
  const newIndex = await options.toApi.call({
    abi: ContractAbis.currentIndex,
    target: wM,
  });
  console.log("===============newIndex:", newIndex);
  // index decimals: 12, wM decimals: 6
  const mYield = ((Number(newIndex) - Number(oldIndex)) * wMBalance) / 1e18;

  console.log("===============mYield:", mYield);
  console.log("===============usycYield:", usycYield);
  //get fees earned by USDTb
  const wUSDTbBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: USDtB,
    params: [USUAL_USDtB],
  });
  const [, oldUsdTbPrice, , ,] = await options.fromApi.call({
    abi: ContractAbis.oraclePrice,
    target: USDtBOracle,
  });
  const [, newUsdTbPrice, , ,] = await options.toApi.call({
    abi: ContractAbis.oraclePrice,
    target: USDtBOracle,
  });
  // oracle decimals: 8, wUSDTb decimals: 18
  const usdTBYield =
    ((Number(newUsdTbPrice) - Number(oldUsdTbPrice)) * wUSDTbBalance) / 1e26;
  console.log("===============usdTBYield:", usdTBYield);

  // get fees earned by USL
  const eUSD0Balance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: eUSD04,
    params: [Treasury],
  });
  const [, oldEUSD0Price, , ,] = await options.fromApi.call({
    abi: ContractAbis.oraclePrice,
    target: eUSD0Oracle,
  });
  const [, newEUSD0Price, , ,] = await options.toApi.call({
    abi: ContractAbis.oraclePrice,
    target: eUSD0Oracle,
  });
  // price decimals: 18, EUSD0 decimals: 18
  const eUSD0Yield =
    ((Number(newEUSD0Price) - Number(oldEUSD0Price)) * eUSD0Balance) / 1e36;
  console.log("===============eUSD0Yield:", eUSD0Yield);
  const totalRwaYield = usycYield + mYield + usdTBYield + eUSD0Yield;

  dailyFees.addUSDValue(totalRwaYield);
  dailyProtocolRevenue.addUSDValue(totalRwaYield);

  return {
    dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: "2024-05-24",  
    },
  },
  methodology,
};

export default adapter;
