import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

//https://docs.merkl.xyz/merkl-mechanisms/technical-overview
const DISTRIBUTION_CREATOR = "0x8BB4C975Ff3c250e0ceEA271728547f3802B36Fd";
const NEW_CAMPAIGN_EVENT = "event NewCampaign((bytes32 campaignId, address creator, address rewardToken, uint256 amount, uint32 campaignType, uint32 startTimestamp, uint32 duration, bytes campaignData) campaign)";

const CAMPAIGN_FEES = "Campaign Fees";
const CAMPAIGN_FEES_TO_MERKL = "Campaign Fees To Merkl";

const feePaymentKey = (txHash: string, token: string) => `${txHash}-${token.toLowerCase()}`;

// Merkl wrapper tokens stand in 1:1 for a real token and have no price of their own
const getWrappedTokens = async (options: FetchOptions, rewardTokens: string[]) => {
  const creators = await options.api.multiCall({ abi: "function distributionCreator() view returns (address)", calls: rewardTokens, permitFailure: true });
  const wrappers = rewardTokens.filter((_, i) => creators[i]?.toLowerCase() === DISTRIBUTION_CREATOR.toLowerCase());
  const wrappedTokens = await options.api.multiCall({ abi: "function token() view returns (address)", calls: wrappers });
  return Object.fromEntries(wrappers.map((wrapper, i) => [wrapper, wrappedTokens[i]]));
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const campaignLogs = await options.getLogs({ target: DISTRIBUTION_CREATOR, eventAbi: NEW_CAMPAIGN_EVENT, onlyArgs: false });

  if (campaignLogs.length) {
    const campaignFeePayments = new Set(campaignLogs.map((log: any) => feePaymentKey(log.transactionHash, log.args.campaign.rewardToken)));
    const rewardTokens = [...new Set<string>(campaignLogs.map((log: any) => log.args.campaign.rewardToken.toLowerCase()))];
    const wrappedTokens = await getWrappedTokens(options, rewardTokens);
    const feeRecipient = await options.api.call({ target: DISTRIBUTION_CREATOR, abi: "function feeRecipient() view returns (address)" });
    const campaignFees = await addTokensReceived({
      options,
      target: feeRecipient,
      tokens: rewardTokens,
      tokenTransform: (token: string) => wrappedTokens[token.toLowerCase()] ?? token,
      logFilter: (transfer: any) => campaignFeePayments.has(feePaymentKey(transfer.transactionHash, transfer.token)),
    });
    dailyFees.addBalances(campaignFees, CAMPAIGN_FEES);
  }

  const dailyRevenue = dailyFees.clone(1, CAMPAIGN_FEES_TO_MERKL);
  const dailyProtocolRevenue = dailyFees.clone(1, CAMPAIGN_FEES_TO_MERKL);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "Fees paid by campaign creators when they fund an incentive campaign on Merkl: 3% of the campaign budget by default, 0.5% for airdrops, 1.5% for encompassing campaigns, with volume discounts down to 1.5% and waivers for some creators.",
  Revenue: "All campaign fees paid by campaign creators, kept by Merkl.",
  ProtocolRevenue: "All campaign fees paid by campaign creators, sent to Merkl's fee recipient wallet.",
};

const breakdownMethodology = {
  Fees: {
    [CAMPAIGN_FEES]: "Fees paid by campaign creators in the reward token when a campaign is created.",
  },
  Revenue: {
    [CAMPAIGN_FEES_TO_MERKL]: "Campaign creation fees kept by Merkl.",
  },
  ProtocolRevenue: {
    [CAMPAIGN_FEES_TO_MERKL]: "Campaign creation fees sent to Merkl's fee recipient wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2024-02-15" },
    [CHAIN.BASE]: { start: "2024-02-14" },
    [CHAIN.ARBITRUM]: { start: "2024-02-14" },
    [CHAIN.POLYGON]: { start: "2024-02-14" },
    [CHAIN.XDAI]: { start: "2024-02-22" },
    [CHAIN.OPTIMISM]: { start: "2024-02-27" },
    [CHAIN.MODE]: { start: "2024-03-14" },
    [CHAIN.SCROLL]: { start: "2024-03-29" },
    [CHAIN.BSC]: { start: "2024-04-08" },
    [CHAIN.LINEA]: { start: "2024-04-12" },
    [CHAIN.XLAYER]: { start: "2024-05-17" },
    [CHAIN.AVAX]: { start: "2024-12-23" },
    [CHAIN.SONIC]: { start: "2025-01-15" },
    [CHAIN.INK]: { start: "2025-02-06" },
    [CHAIN.SONEIUM]: { start: "2025-02-10" },
    [CHAIN.UNICHAIN]: { start: "2025-02-14" },
    [CHAIN.BERACHAIN]: { start: "2025-02-14" },
    [CHAIN.HYPERLIQUID]: { start: "2025-03-21" },
    [CHAIN.HEMI]: { start: "2025-04-08" },
    [CHAIN.KATANA]: { start: "2025-06-10" },
    [CHAIN.PLASMA]: { start: "2025-09-12" },
    [CHAIN.MONAD]: { start: "2025-10-27" },
    [CHAIN.MEGAETH]: { start: "2026-01-13" },
    [CHAIN.ROBINHOOD]: { start: "2026-05-13" },
    [CHAIN.ARC]: { start: "2026-06-29" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
