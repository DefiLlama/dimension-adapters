# Public Bridge Evidence Contract

`GET https://www.dyli.io/api/public/defillama` accepts a destination `chainId`,
`transactionHash` and DYLI `recipient`. The adapter relies on this endpoint for
source-to-deposit attribution, then independently checks who funded the source.
It does not infer a cross-chain relationship from two unrelated positive transfers.

## Required Guarantee

For an internal bridge response, `sourceChainId` and `sourceTransactionHash`
identify the origin of the **same completed Relay request** that delivered the
queried destination transaction to the queried recipient on the queried chain.
The endpoint does not accept a caller-supplied source hash or pick an unrelated
transfer from the source wallet's history.

The deployed endpoint has two attribution paths:

1. **Current Relay requests.** Query Relay v3 using the destination hash and
   recipient. Require exactly one successful request whose recipient matches and
   whose `data.outTxs` contains that exact hash on that exact chain. Only then
   select a source from that request's `data.inTxs`. Return an internal source
   only when that same request's `user` is a DYLI-controlled address.
2. **Archived migration requests.** Match an exact fixed destination hash, chain
   and recipient to one of the four pairs below. Each pair was taken from one
   successful public Relay request containing both the origin transaction and
   the destination transaction. The request's protocol deposit origin also
   identified the same source hash and source chain. Both onchain receipts were
   checked. No wildcard address, date-range rule, amount heuristic or runtime
   legacy-API lookup is used.

For current requests, the source-selection order in the deployed implementation
is equivalent to:

```javascript
const matches = payload.requests.filter(request =>
  request.status === 'success' &&
  request.recipient.toLowerCase() === recipient &&
  request.data?.outTxs?.some(tx =>
    tx.txHash.toLowerCase() === transactionHash && Number(tx.chainId) === chainId))
if (matches.length !== 1) throw new Error('Incomplete bridge evidence')
const request = matches[0]
const source = request.data.inTxs?.find(tx => HASH.test(tx.txHash))
const internal = MANAGED_WALLETS.has(request.user.toLowerCase())
if (internal && !source) throw new Error('Missing source evidence')
```

See [Relay's v3 request documentation](https://docs.relay.link/references/api/api_guides/migrating-to-requests-v3)
for the request, `inTxs` and `outTxs` fields and visibility limitations. An absent,
ambiguous, inaccessible or malformed request fails the fetch rather than being
classified as either income or an internal transfer.

## Archived Provenance

These public request IDs and transaction pairs were archived on October 19,
2026. All destination transactions are on Base (8453). The destination recipient
is the vault wallet `0x04eaa73b518783010a5a5dc471eea89c4c34ef44` for the first two
rows and the platform wallet `0xfb1302f5d6c5f107a0715b8ce7303d1e3c647807` for the
last two.

| Relay request ID | Source chain / transaction | Base destination transaction |
| --- | --- | --- |
| `0x1792013352d104e6186178d26e1385b4d420cae8d583957b6bb4a8e294de7b77` | [Abstract (2741)](https://abscan.org/tx/0xf00af7ecea7f158ecf8669f9cee811390452ad12c12422825888ef77f89309c5) | [5,101.849703 USDC](https://basescan.org/tx/0xa246816aaba90f49631b17f0adcdc141f5b1806a029417b018959e4df0ee5a39) |
| `0x1792013313d70b557af7016edeb2b21325d989b835e709c1a2c5163fe999cf82` | [Ethereum (1)](https://etherscan.io/tx/0x92dfa05dcdb7a250ecc2386536ae621f2a8a6d8d14c83cdeb12ba1d6c53d2916) | [2,108.538143 USDC](https://basescan.org/tx/0xccb6ed0f7a1e02630bdebe220ad0ed0138df6c2cdf38ca3d041070952b8dbf31) |
| `0x179208914768bffe6e936f7e6aab5eb6fd40a2d6c0647527abfe74fe89f621ba` | [Abstract (2741), funded with 0.05 ETH](https://abscan.org/tx/0xa1ad37a408e89e1017af624351b83d179a45881a0469bcfca7b030ca7e3fbb55) | [121.600837 USDC](https://basescan.org/tx/0xaf50be0283f391195557ff431de3c5409ef3ad5c45406ec102fce8bd818fd8ce) |
| `0x1792089129b8f415b6930025938f924e72f3aa05ef1079023ffbfc4e82b8a4d7` | [Abstract (2741)](https://abscan.org/tx/0x8334ee6afbd9e866484213edf44dc3a4354752f50242af1a847e683e1c8e2fb4) | [688.210687 USDC](https://basescan.org/tx/0xde1c47a286684be7a0f617422c9bbedcdb74036950e346ce0340150990ff5c7e) |

The response contains public chain/hash references only, not Stripe IDs, private
customer records or credentials. Archived entries are fixed reviewed attribution,
not a claim that a source receipt alone cryptographically proves a Relay route.

## Adapter Checks

Before excluding a receipt, the adapter matches the returned destination chain,
hash and recipient to the actual incoming USDC log. It then requires a supported
source chain and a confirmed source receipt, and verifies a positive USDC
transfer or native-token transfer from a DYLI-controlled address in that origin
transaction. A reverted transaction or gas spending alone does not qualify.

This second step establishes DYLI ownership of the already-bound source funding.
Neither sender ownership nor an arbitrary source outflow replaces the endpoint's
binding guarantee. The adapter deliberately does not require source/destination
amount equality or direct recipient equality: Relay can route through deposit
contracts, charge bridging fees, or convert native ETH to destination USDC.
