import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * StonkBrokers Anvil NFT AMM volume on Robinhood Chain.
 *
 * Volume is the ETH notional of each NFT↔$STONKBROKER trade
 * (ethNotionalPerNFT per fill). Token legs are fixed at 666,666 STONKBROKER.
 */
const AMM_VAULT = "0xE302733accF4800146E55fC45B46b4E4fFC032D2";

const NFT_SOLD =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 tokensOut, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const NFT_BOUGHT =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 tokensIn, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare, bool isSpecific)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [ethNotional, sold, bought] = await Promise.all([
    options.api.call({ target: AMM_VAULT, abi: "uint256:ethNotionalPerNFT" }),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD }),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT }),
  ]);

  const trades = sold.length + bought.length;
  if (trades > 0) {
    dailyVolume.addGasToken(BigInt(ethNotional) * BigInt(trades));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-07-17" },
  },
  methodology: {
    Volume:
      "ETH notional of StonkBrokers NFT AMM fills (buyRandomNFT / buySpecificNFT / sellNFT), using the vault's ethNotionalPerNFT oracle/fallback per trade.",
  },
};

export default adapter;
