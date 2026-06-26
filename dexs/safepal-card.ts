import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Reference query: https://dune.com/queries/6696115
// SafePal Card uses Fiat24 card infrastructure on Arbitrum. Spend is emitted by
// the shared Fiat24 card spend contract, so attribution must be narrowed to the
// SafePal cohort through the SafePal anchor wallet found in the Fiat24 NFT mint tx.

const SPEND_CONTRACT = "0xe2e3B88B9893e18D0867c08f9cA93f8aB5935b14";
const NFT_CONTRACT = "0x133CAEecA096cA54889db71956c7f75862Ead7A0";
const ANCHOR_CONTRACT = "0x22043fDdF353308B4F2e7dA2e5284E4D087449e1";
const SAFEPAL_ANCHOR = "0xc2005d5ae1fe27a481674fe7a12a012dfe35ee04";
const MINT_START_BLOCK = 259089162;

const SPEND_EVENT = "event Authorized (string authorizationToken, uint256 indexed tokenId, address indexed sender, string cardId, address cardCurrency, uint256 paidAmount)";
const APPROVAL_EVENT = "event Approval(address indexed owner, address indexed spender, uint256 value)";
const TRANSFER_EVENT = "event Transfer (address indexed from, address indexed to, uint256 indexed tokenId)";
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
const CURRENT_DECIMALS = 2;

const FIAT24_CURRENCIES = new Set([
  "0xbe00f3db78688d9704bcb4e0a827aea3a9cc0d62", //USD
  "0x2c5d06f591d0d8cd43ac232c2b654475a142c7da", //EUR
  "0xd41f1f0cf89fd239ca4c1f8e8ada46345c86b0a4", //CHF
  "0x7288ac74d211735374a23707d1518dcbbc0144fd", //CNH
]);

const topic = (address: string) =>
  "0x000000000000000000000000" + address.slice(2).toLowerCase();

const chainConfig: Record<string, { start: string; rateContract: string; usd24: string; rateDivisor: number }> = {
  [CHAIN.ARBITRUM]: {
    start: "2024-11-27",
    rateContract: "0x4582f67698843Dfb6A9F195C0dDee05B0A8C973F",
    usd24: "0xbE00f3db78688d9704BCb4e0a827aea3a9Cc0D62",
    rateDivisor: 1e4,
  },
};

const getSafePalWallets = async (options: FetchOptions) => {
  const toBlock = await options.getToBlock();
  const [anchorLogs, mintLogs] = await Promise.all([
    options.getLogs({
      target: ANCHOR_CONTRACT,
      eventAbi: APPROVAL_EVENT,
      topics: [APPROVAL_TOPIC, topic(SAFEPAL_ANCHOR)],
      fromBlock: MINT_START_BLOCK,
      toBlock: toBlock,
      cacheInCloud: true,
      onlyArgs: false,
    }),
    options.getLogs({
      target: NFT_CONTRACT,
      eventAbi: TRANSFER_EVENT,
      topics: [TRANSFER_TOPIC, ZERO_TOPIC],
      fromBlock: MINT_START_BLOCK,
      toBlock,
      cacheInCloud: true,
      onlyArgs: false,
    }),
  ]);

  const anchorTxHashes = new Set(
    anchorLogs.map((log: any) => log.transactionHash.toLowerCase()),
  );

  const safepalWallets = new Set<string>();
  for (const log of mintLogs) {
    const txHash = log.transactionHash?.toLowerCase();
    if (!txHash || !anchorTxHashes.has(txHash)) continue;
    const wallet = (log.args?.to ?? log.to)?.toLowerCase();
    if (wallet) safepalWallets.add(wallet);
  }

  return safepalWallets;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { rateContract, usd24, rateDivisor } = chainConfig[options.chain];

  const spendLogs = await options.getLogs({
    target: SPEND_CONTRACT,
    eventAbi: SPEND_EVENT,
  })

  const safepalWallets = await getSafePalWallets(options);

  const currencyMap = new Map<string, number>();

  for (const log of spendLogs) {
    const wallet = log.sender.toLowerCase();
    if (!safepalWallets.has(wallet)) continue;

    const currency = log.cardCurrency.toLowerCase();
    if (!FIAT24_CURRENCIES.has(currency)) continue;

    const amount = Number(log.paidAmount) / 10 ** CURRENT_DECIMALS;
    currencyMap.set(currency, (currencyMap.get(currency) ?? 0) + amount);
  }

  if (currencyMap.size === 0) return { dailyVolume };

  const currencies = Array.from(currencyMap.keys());
  const rates = await options.api.multiCall({
    target: rateContract,
    abi: "function getExchangeRate(address inputToken, address outputToken) view returns (uint256)",
    calls: currencies.map((currency) => ({ params: [usd24, currency] })),
  });

  currencies.forEach((currency, i) => {
    const rate = Number(rates[i]);
    if (rate) dailyVolume.addUSDValue(currencyMap.get(currency)! * rateDivisor / rate);
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD value spent by SafePal card holders via Fiat24 issuer.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
