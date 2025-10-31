import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEulerVaultFee } from "../helpers/curators/index";

/**
 * 
 * Usual takes RWA stablecoins from users and issue USD0 stablecoins
 * Users can stake USD0, receive USD0++ and earn USUAL tokens
 * Users can stake USUAL, receive USUALx and earn USUAL tokens
 * 
 * There are four places where Usual takes fees:
 * 1. Usual earns fees from locked RWA assets
 * 2. When users redeem USD0 stablecoins, Usual takes an amount of redemption fees in USD0 tokens
 * 3. When users early unstake USD0++ at floor price
 * 4. When users early unstake USD0++, users must commit an amount of USUAL tokens
 *    these USUAL tokens then are burnt and distributed to USUALx stakers
 * 5. Usual deployed Euler vaults for borrowing and takes borrow interest
 * 
 * So:
 * We count 1, 2, 3, 5 as protocol revenue
 * We count 4 as holder revenue
 * 
 * There is no source of revenue for supply side users - USD0 minters.
 * Rewarded USUAL tokens to USD0++ and USUALx stakers are incentive from Usual, not from RWA assets yield.
 * 
 */

const methodology = {
  Fees: 'Yields from underlying assets,usual stability loan interests, total USD0 redemption fees and USD0++ early unstake fees.',
  Revenue: 'Total fees collected by protocol, distributed to USUAL token stakers, buyback and burn.',
  ProtocolRevenue: 'Total fees are distributed to protocol treasury.',
  HoldersRevenue: 'Total fees are distributed to token holders, token burns',
}

const DaoCollateral = '0xde6e1F680C4816446C8D515989E2358636A38b04'
const Treasury = '0xdd82875f0840AAD58a455A70B88eEd9F59ceC7c7'
const USD0 = ADDRESSES.ethereum.USD0
const USUAL = '0xc4441c2be5d8fa8126822b9929ca0b81ea0de38e'
const USD0PP = '0x35d8949372d46b7a3d5a56006ae77b215fc69bc0'
const USUALX = '0x06B964d96f5dCF7Eae9d7C559B09EDCe244d4B8E'

const USYC = '0x136471a34f6ef19fe571effc1ca711fdb8e49f2b'
const USYCOracle = '0x4c48bcb2160F8e0aDbf9D4F3B034f1e36d1f8b3e'
const wM = '0x437cc33344a0B27A429f795ff6B469C72698B291'
const USUAL_wM = '0x4Cbc25559DbBD1272EC5B64c7b5F48a2405e6470'
const EULER_VAULTS = ['0xd001f0a15D272542687b2677BA627f48A4333b5d']

const ContractAbis = {
  // USYC
  balanceOf: 'function balanceOf(address) view returns (uint256 balance)',
  usycOraclePrice: 'function latestRoundData() view returns(uint80 roundId, int256 answer, uint256 startAt, uint256 updatedAt, uint80 answeredInRound)',

  // wM
  currentIndex: 'uint256:currentIndex',

  // users redeem USD0 to RWA stablecoins
  RedeemEvent: 'event Redeem(address indexed redeemer, address indexed rwaToken, uint256 amountRedeemed, uint256 returnedRwaAmount, uint256 stableFeeAmount)',

  // collect USUAL paid by early unstake USD0++ users
  FeeSweptEvent: 'event FeeSwept(address indexed caller, address indexed collector, uint256 amount)',
  
  // collect USD0 fees to treasury
  Usd0ppUnlockedFloorPriceEvent: 'event Usd0ppUnlockedFloorPrice(address indexed user, uint256 usd0ppAmount, uint256 usd0Amount)',
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  const redeemEvents: Array<any> = await options.getLogs({
    target: DaoCollateral,
    eventAbi: ContractAbis.RedeemEvent,
  })
  const feeSweptEvents: Array<any> = await options.getLogs({
    targets: [USD0PP,USUALX],
    eventAbi: ContractAbis.FeeSweptEvent,
  })
  const usd0ppUnlockedFloorPriceEvents: Array<any> = await options.getLogs({
    target: USD0PP,
    eventAbi: ContractAbis.Usd0ppUnlockedFloorPriceEvent,
  })

  for (const event of redeemEvents) {
    dailyFees.add(USD0, Number(event.stableFeeAmount))
    dailyProtocolRevenue.add(USD0, Number(event.stableFeeAmount))
  }
  for (const event of feeSweptEvents) {
    dailyFees.add(USUAL, Number(event.amount))

    // https://docs.usual.money/usual-products/usd0-liquid-staking-token/usd0++-early-redemption-mechanism#how-does-it-work
    //67% of the fees are distributed to USUALx,Usual* stakers
    //33% of the fees are burnt
    dailyHoldersRevenue.add(USUAL, Number(event.amount))
  }
  for (const event of usd0ppUnlockedFloorPriceEvents) {
    const feeAmount = Number(event.usd0ppAmount) - Number(event.usd0Amount)

    dailyFees.add(USD0, feeAmount)
    dailyProtocolRevenue.add(USD0, feeAmount)
  }

  // get fees earned by USYC
  const usycBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: USYC,
    params: [Treasury],
  })
  const [, oldPrice, , ,] = await options.fromApi.call({
    abi: ContractAbis.usycOraclePrice,
    target: USYCOracle,
  })
  const [, newPrice, , ,] = await options.toApi.call({
    abi: ContractAbis.usycOraclePrice,
    target: USYCOracle,
  })
  // price decimals: 8, USYC decimals: 6
  const usycYield = (Number(newPrice) - Number(oldPrice)) * usycBalance / 1e14

  // get fees earned by wM
  const wMBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: wM,
    params: [USUAL_wM],
  })
  const oldIndex = await options.fromApi.call({
    abi: ContractAbis.currentIndex,
    target: wM,
  })
  const newIndex = await options.toApi.call({
    abi: ContractAbis.currentIndex,
    target: wM,
  })
  // index decimals: 12, wM decimals: 6
  const mYield = (Number(newIndex) - Number(oldIndex)) * wMBalance / 1e18

  const totalRwaYield = usycYield + mYield
  
  dailyFees.addUSDValue(totalRwaYield)
  dailyProtocolRevenue.addUSDValue(totalRwaYield)
  await getEulerVaultFee(options, { dailyFees, dailyRevenue }, EULER_VAULTS)

  dailyRevenue.add(dailyProtocolRevenue)
  dailyRevenue.add(dailyHoldersRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-05-24',
    },
  },
  methodology,
};

export default adapter;
