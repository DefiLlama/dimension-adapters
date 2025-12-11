import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

async function getTotalReceived(startTimestamp: number, endTimestamp: number, senderAccount: string, receiverAccount: string, assetId: number) {
  let receivedAmount = 0
  const toRFC3339 = (timestamp: number) => new Date(timestamp * 1000).toISOString();
  const startRFC3339 = toRFC3339(startTimestamp);
  const endRFC3339 = toRFC3339(endTimestamp);
  const baseURL = `https://mainnet-idx.4160.nodely.dev/v2/transactions`;
  let nextToken: string | undefined = undefined;

  do {
    let url = `${baseURL}?after-time=${startRFC3339}&before-time=${endRFC3339}&asset-id=${assetId}&address=${receiverAccount}&address-role=receiver`;
    if (nextToken) {
      url += `&next=${nextToken}`;
    }
    const response = await fetchURL(url);
    const txns = response.transactions || [];

    const amounts = getAmountsForReceiver(txns, senderAccount, receiverAccount, assetId);
    for (const amount of amounts) {
      if (typeof amount === 'number' && !isNaN(amount)) {
        receivedAmount += amount;
      }
    }

    nextToken = response['next-token'];
  } while (nextToken);
  return receivedAmount;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  const USDCAssetId = 31566704;
  const HayAssetId = 3160000000;
  // Haystack Boost USDC deposit address
  const BoostAccount = 'XZDIPKN5ZEEZVNKK6PLVYPFISFRO4SW7EIVVXTWIILQXGI5OQXLI5VCVBU';

  // Contract account for App ID: 3321763884
  const StakingAccount = 'OLSICPA5V6IPWORUVWQKCJTSFKLP7P5JORZBICKU6CH7W7EVMDALLWD7SQ';

  // account that receives eventual autoswap fees for buy/stake distribution
  const BuybackAccount = 'HAYBUYTCKOLZKATO4HOZ4A7JSQ5Q6ULNBL7UJUI7HR4X23G3ULII4MBBBM';

  // account that gets assets from escrow and does autoswap, etc. but also that sends HAY directly to staking contract
  const AutoSwapAccount = 'YM5EVOUH254B7MOSLGK5HQVDFHMNE2F7TSBVNXAKXCDR7DMZELOZSYSLPY';

  // Escrow account that receives ALL fees for the protocol
  const TreasuryFeeEscrow = 'FJ2DSKGDEH66SDEHABYM35JMMDDVLMJFFYD5K6S2U7IIWKICMCGNIAWJ5Y'

  // Protocol treasury account
  const TreasuryAccount = 'R6KP6FOKGJM6I53EIJESWNCZBYS3UO4EY56SF3LZXFTNJBXIOAP7LEGCBQ'

  // ARC54 Burn account
  const BonfireBurnAccount = 'BNFIREKGRXEHCFOEQLTX3PU5SUCMRKDU7WHNBGZA4SXPW42OAHZBP7BPHY'

  // boosts are USDC deposits from anyone to boost account
  const boostFees = await getTotalReceived(startTimestamp, endTimestamp, '', BoostAccount, USDCAssetId);

  // all USDC sent TO the buyback account (via autoswap) - are either USDC received or USDC after swapping assets into USDC - result sent to buyback (total fees)
  const protocolFees = await getTotalReceived(startTimestamp, endTimestamp, '', BuybackAccount, USDCAssetId);

  // HAY purchased from users is pulled from escrow into autoswap account then sent directly to staking account - so tracking here how much HAY was received as part of protocol revenue
  const protocolHayFees = await getTotalReceived(startTimestamp, endTimestamp, TreasuryFeeEscrow, AutoSwapAccount, HayAssetId);

  // Any USDC sent from buyback account to treasury is the % being sent to the treasury from stake/buy/burn process
  const treasuryFees = await getTotalReceived(startTimestamp, endTimestamp, BuybackAccount, TreasuryAccount, USDCAssetId);

  // USDC and HAY sent TO staking account from buyback (or autoswap in case of HAY that's passed through) is what's distributed to stakers.
  const stakingUsdc = await getTotalReceived(startTimestamp, endTimestamp, BuybackAccount, StakingAccount, USDCAssetId);
  const stakingHay = await getTotalReceived(startTimestamp, endTimestamp, AutoSwapAccount, StakingAccount, HayAssetId);

  // HAY that's been bought and burned is sent to bonfire burn account
  const burnHay = await getTotalReceived(startTimestamp, endTimestamp, BuybackAccount, BonfireBurnAccount, HayAssetId);

  // treasury escrow receives all swap fees from the protocol
  // the fees in various assets are sent to the autoswap acount which then swaps into USDC and sends to the buyback account.
  // So, the buyback account receives all swap fees from the protocol (in USDC)
  // The buyback account then sends a percentage of that to the staking contract for USDC rewards
  // A portion of HAY is also sent to the staking contract for staking rewards

  const dailyBalances = options.createBalances()

  dailyBalances.addToken(USDCAssetId.toString(), protocolFees + boostFees, 'USDC');
  dailyBalances.addToken(HayAssetId.toString(), protocolHayFees, 'HAY');

  const treasuryBalances = options.createBalances()
  treasuryBalances.addToken(USDCAssetId.toString(), treasuryFees, 'USDC');

  const stakingAndBurnBalances = options.createBalances()

  stakingAndBurnBalances.addToken(HayAssetId.toString(), stakingHay + burnHay, 'HAY');
  stakingAndBurnBalances.addToken(USDCAssetId.toString(), stakingUsdc, 'USDC');

  return {
    dailyFees: dailyBalances,
    dailyUserFees: dailyBalances,
    dailyRevenue: dailyBalances,
    dailyProtocolRevenue: treasuryBalances,
    dailyHoldersRevenue: stakingAndBurnBalances,
  };
};

function getAmountsForReceiver(transactions: any[], sender: string, receiver: string, assetId: number): number[] {
  const amounts: number[] = [];

  function searchTxns(txns: any[]) {
    for (const txn of txns) {
      if (
        txn['asset-transfer-transaction'] &&
        txn['asset-transfer-transaction'].receiver === receiver &&
        txn['asset-transfer-transaction']['asset-id'] === assetId
      ) {
        // if sender was passed make sure it matches
        if (sender !== '' && txn.sender !== sender) {
          continue;
        }
        amounts.push(txn['asset-transfer-transaction'].amount);
      }
      if (txn['inner-txns']) {
        searchTxns(txn['inner-txns']);
      }
    }
  }

  searchTxns(transactions);
  return amounts;
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ALGORAND],
  start: '2025-09-01',
  methodology: {
    Fees: "Trading fees and Asset boosts paid by users, tracked in USDC and HAY.",
    Revenue: "Trading fees and Asset boosts are considered platform revenue.",
    ProtocolRevenue: "Portion of trading fees and boosts allocated to the treasury (USDC).",
    HoldersRevenue: "A share of fees (HAY and USDC) is periodically distributed to stakers or holders via staking and burn mechanisms.",
  }
};

export default adapter;
