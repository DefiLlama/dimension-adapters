import ADDRESSES from "./coreAssets.json";
import { extractPubkey, getProgramAccounts } from "./solana";

export const BASEDBID_SOLANA_PROGRAM = "CuodpYRDz4k87K6ZUFxk7X8JkVv5dNVZAcTQX2TEzTef";

// Quote tokens every BasedBid launch could use before arbitrary quote tokens were allowed.
const DEFAULT_QUOTE_MINTS = [
  ADDRESSES.solana.SOL,
  ADDRESSES.solana.USDC,
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
];

// base58 of sha256("account:MemeTokenData")[0..8], the Anchor account discriminator.
const MEME_TOKEN_DATA_DISCRIMINATOR = "34hmFoGDiPJ";
// MemeTokenData layout: discriminator (8) + seed string (4 + len) + 158 bytes of fixed
// fields, then initialData, whose first field is the quote mint (baseTokenForPair).
const SEED_LENGTH_OFFSET = 8;
const QUOTE_MINT_OFFSET_AFTER_SEED = 158;
// The default pubkey marks a native-SOL raise, which is already covered by the SOL mint.
const NATIVE_PLACEHOLDER = "11111111111111111111111111111111";

let quoteMintsPromise: Promise<string[]> | undefined;

// A project can launch against any quote token, so the quote mints are read from the
// projects registered on the program instead of a fixed list.
export const getBasedBidSolanaQuoteMints = (): Promise<string[]> => {
  if (!quoteMintsPromise) quoteMintsPromise = loadQuoteMints();
  return quoteMintsPromise;
};

async function loadQuoteMints(): Promise<string[]> {
  const accounts = await getProgramAccounts({
    programId: BASEDBID_SOLANA_PROGRAM,
    encoding: "base64",
    filters: [{ memcmp: { offset: 0, bytes: MEME_TOKEN_DATA_DISCRIMINATOR } }],
  });
  if (!accounts.length) throw new Error("basedbid: no MemeTokenData accounts returned");

  const mints = new Set<string>(DEFAULT_QUOTE_MINTS);
  accounts.forEach((account: any) => {
    const data = Buffer.from(account.account.data[0], "base64");
    const offset = SEED_LENGTH_OFFSET + 4 + data.readUInt32LE(SEED_LENGTH_OFFSET) + QUOTE_MINT_OFFSET_AFTER_SEED;
    if (data.length < offset + 32) return;
    const mint = extractPubkey(account.account.data[0], offset);
    if (mint !== NATIVE_PLACEHOLDER) mints.add(mint);
  });

  return [...mints];
}
