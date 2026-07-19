import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * StonkBrokers Anvil NFT AMM volume on Robinhood Chain.
 *
 * Volume is inferred from the ETH trade fee and the known fee bps
 * (random 10% / snipe 15% of ethNotionalPerNFT) so we do not need an
 * extra eth_call per hour (Robinhood public RPC rate-limits easily).
 */
const AMM_VAULT = "0xE302733accF4800146E55fC45B46b4E4fFC032D2";
const RANDOM_FEE_BPS = 1000n;
const SPECIFIC_FEE_BPS = 1500n;

const NFT_SOLD =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 tokensOut, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const NFT_BOUGHT =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 tokensIn, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare, bool isSpecific)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [sold, bought] = await Promise.all([
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD }),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT }),
  ]);

  for (const log of sold) {
    // sellNFT always uses randomFeeBps (10%)
    if (log.ethFeePaid > 0n) {
      dailyVolume.addGasToken((log.ethFeePaid * 10_000n) / RANDOM_FEE_BPS);
    }
  }

  for (const log of bought) {
    const bps = log.isSpecific ? SPECIFIC_FEE_BPS : RANDOM_FEE_BPS;
    if (log.ethFeePaid > 0n) {
      dailyVolume.addGasToken((log.ethFeePaid * 10_000n) / bps);
    }
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
      "ETH notional of StonkBrokers NFT AMM fills, derived from ethFeePaid and the vault fee bps (10% random / 15% snipe).",
  },
};

export default adapter;
