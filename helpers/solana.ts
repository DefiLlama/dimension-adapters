// Solana helpers on top of `sdk.chains.svm`. The RPC transport (endpoint from `SOLANA_RPC`,
// per-chain rate limiting, retries) and the codecs (base58, I80F48, PDA derivation, SPL
// layouts) live in the sdk; this file only keeps the adapter-facing signatures stable.
import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints (SOLANA_RPC, ...) into process.env for the sdk

const svm = sdk.chains.svm

// UI amount (already divided by decimals) of an SPL mint's total supply.
export async function getTokenSupply(token: string): Promise<number> {
  const { uiAmount } = await svm.getTokenSupply({ token })
  return uiAmount
}

// UI amount of `token` held by `account`, summed over all of its token accounts.
export async function getTokenBalance(token: string, account: string): Promise<number> {
  const accounts = await svm.getTokenAccountsByOwner({ owner: account, mint: token })
  return accounts.reduce((total, i) => total + i.uiAmount, 0)
}

// Raw JSON-RPC call against the configured Solana endpoint; returns `result`.
export async function solanaRpc(method: string, params: any[] = []): Promise<any> {
  return svm.call({ method, params })
}

// rpc
export const getProgramAccounts = svm.getProgramAccounts
export const getAccounts = svm.getAccounts
export const getMultipleAccounts = svm.getAccounts
export const getAccountInfo = svm.getAccountInfo
export const getAccountBuffer = svm.getAccountBuffer
export const getSignaturesForAddress = svm.getSignaturesForAddress
export const getTransaction = svm.getTransaction

// codecs
export const extractPubkey = svm.extractPubkey
export const readI80F48 = svm.readI80F48
export const i80f48ToNumber = svm.i80f48ToNumber
export const readBigUInt64LE = svm.readBigUInt64LE
export const base58Encode = svm.base58Encode
export const base58Decode = svm.base58Decode
export const isValidPublicKey = svm.isValidPublicKey
export const findProgramAddress = svm.findProgramAddress
export const createProgramAddress = svm.createProgramAddress
export const getAssociatedTokenAddress = svm.getAssociatedTokenAddress
export const decodeMintAccount = svm.decodeMintAccount
export const decodeTokenAccount = svm.decodeTokenAccount
export const decodeStakePool = svm.decodeStakePool

export type { AccountInfo, ProgramAccount, SignatureInfo, TokenSupply } from "@defillama/sdk/build/chains/svm"
