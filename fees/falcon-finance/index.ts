import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getERC4626VaultsYield } from "../../helpers/erc4626";

const usdfToken = "0xFa2B947eEc368f42195f24F36d2aF29f7c24CeC2";
const susdfToken = "0xc8CF6D7991f15525488b2A83Df53468D682Ba4B0";
const sffToken = "0x1a0C3FfCbd101c6f2f6650DED9964c4A568C4D72";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  // sUSDf and sFF staking vault yield
  const dailyFees = await getERC4626VaultsYield({ options, vaults: [susdfToken, sffToken] })

  // FalconPosition nft rewards
  const nftFeeEvents = await options.getLogs({
    target: "0x8407e9864F42374Cb9DACfDEDe0e6962d634edCB",
    eventAbi: "event FeesCollected(uint256 indexed tokenId, uint256 amount)",
  })
  const totalNftFees = nftFeeEvents.reduce((acc, event) => acc + Number(event.amount), 0)
  const assetValue = await options.api.call({
    target: susdfToken,
    abi: 'function convertToAssets(uint256 shares) view returns (uint256)',
    params: [totalNftFees.toString()],
  })
  dailyFees.add(usdfToken, assetValue);

  // FF Staking contract rewards
  const rewardEvents = await options.getLogs({
    target: "0x1E7fFB2cc2B0D9672b3E615dD5669C06F8673CAe",
    eventAbi: "event RewardPaid(address indexed user, uint256 reward)",
  });
  for (const event of rewardEvents) {
    dailyFees.add(usdfToken, event.reward);
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'Yield generated from sUSDf vault, sFF vault, FalconPosition NFT staking, and FF token staking.',
  Revenue: 'No revenue is collected for the protocol inside the Falcon Finance smart contracts.',
  SupplySideRevenue: 'All yield is distributed to stakers.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-02-10',
  methodology,
}

export default adapter;