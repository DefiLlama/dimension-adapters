import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { eventTopic, KALOS_SPLITTER, kalosReferralExclusion, padAddress } from "../../helpers/kalos";

// Kalos Launchpad (https://www.kalos.fun) on Kinetiq Elysium: creator NFT drops on OpenSea's SeaDrop contracts.
// Every drop launched on Kalos (collections deployed by the Kalos launcher 0xcA105642B3890B42927F50c1bEf3F6288448421c or
// set up and handed over through KalosCollectionDeployer 0x0a5fB5F91cB4424925E10d5b2d6DB1D2298CAf5C) mints through the
// Kalos SeaDrop hub below, which pays feeBps (1000 = 10%) of each mint to the feeRecipient, the Kalos revenue splitter,
// in native HYPE, and the rest to the creator. Fees: https://www.kalos.fun/learn/fees
const KALOS_SEADROP = '0xCa10569ec3EdA292f435041d7610150e53119BaE';
const KALOS_LAUNCHPAD_START = '2026-11-06';
const BASIS_POINTS = 10_000n;

const SeaDropMintEvent = 'event SeaDropMint(address indexed nftContract, address indexed minter, address indexed feeRecipient, address payer, uint256 quantityMinted, uint256 unitMintPrice, uint256 feeBps, uint256 dropStageIndex)';

const LABELS = {
  MINT: 'NFT Mint Fees',
  MINT_PROTOCOL: 'NFT Mint Fees To Protocol',
};

/** Primary mint volume and the Kalos mint fee of drops launched on Kalos, minted in the window */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  // feeRecipient is indexed: the node returns only mints that pay the Kalos fee (a drop with another fee recipient is not a Kalos drop)
  const mints = await options.getLogs({
    target: KALOS_SEADROP,
    eventAbi: SeaDropMintEvent,
    topics: [eventTopic(SeaDropMintEvent), null, null, padAddress(KALOS_SPLITTER)],
  });
  for (const mint of mints) {
    // the same check on the decoded log
    if (String(mint.feeRecipient).toLowerCase() !== KALOS_SPLITTER.toLowerCase()) continue;
    const paid = BigInt(mint.quantityMinted) * BigInt(mint.unitMintPrice);
    const mintFee = paid * BigInt(mint.feeBps) / BASIS_POINTS;
    dailyVolume.addGasToken(paid);
    dailyFees.addGasToken(mintFee, LABELS.MINT);
    dailyRevenue.addGasToken(mintFee, LABELS.MINT_PROTOCOL);
  }
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const REFERRAL_EXCLUSION = kalosReferralExclusion('the Kalos launchpad');

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: KALOS_LAUNCHPAD_START,
  methodology: {
    Volume: 'Value of NFTs minted from creator drops launched on the Kalos launchpad, paid in HYPE.',
    Fees: "Launchpad fees paid by minters: 10% of the mint price of every NFT minted from drops launched on Kalos. Excludes the rest of the mint price, which goes to the drop's creator.",
    UserFees: "Launchpad fees paid by minters: 10% of the mint price of every NFT minted from drops launched on Kalos. Excludes the rest of the mint price, which goes to the drop's creator.",
    Revenue: `All launchpad fees paid by minters, kept by Kalos. ${REFERRAL_EXCLUSION}`,
    ProtocolRevenue: `All launchpad fees paid by minters, sent to Kalos's own vaults and referral pool. ${REFERRAL_EXCLUSION}`,
  },
  breakdownMethodology: {
    Fees: { [LABELS.MINT]: 'Kalos fee of 10% of the mint price on NFTs minted from Kalos launchpad drops.' },
    UserFees: { [LABELS.MINT]: 'Kalos fee of 10% of the mint price on NFTs minted from Kalos launchpad drops, paid by minters.' },
    Revenue: { [LABELS.MINT_PROTOCOL]: 'All Kalos launchpad fees, kept by Kalos.' },
    ProtocolRevenue: { [LABELS.MINT_PROTOCOL]: "All Kalos launchpad fees, sent to Kalos's own vaults and referral pool." },
  },
};

export default adapter;
