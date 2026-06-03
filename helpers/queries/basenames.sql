-- Basenames — total ETH paid for registrations and renewals on Base.
--
-- Sums the `price` field from ETHPaymentProcessed events across all three
-- Basenames registrar controllers. The event signature is identical for all
-- versions (the contract is upgradeable, but the emit site has not changed):
--
--   event ETHPaymentProcessed(address indexed payee, uint256 price)
--
-- topic0 = keccak256("ETHPaymentProcessed(address,uint256)")
--        = 0xbc769889246686134856b409155bb87630ea5797a705fa98b61f576d316aab9b
--
-- data = abi-encoded uint256 price (wei). Decoded with varbinary_to_uint256.
--
-- The `price` field is the protocol-set ETH cost post-discount (not msg.value),
-- so user overpayment refunds are excluded automatically by the contract itself.
--
-- Controllers covered (all on Base mainnet):
--   v0  0xd3e6775ed9b7dc12b205c8e608dc3767b9e5efda  (2024-07-25 → 2024-08-15)
--   v1  0x4ccb0bb02fcaba27e82a56646e81d8c5bc4119a5  (2024-08-21 → 2025-09-23)
--   v2  0xa7d2607c6bd39ae9521e514026cbb078405ab322  (2025-09-09 → present)

SELECT
    CAST(SUM(varbinary_to_uint256(data)) AS double) / 1e18 AS eth_paid
FROM base.logs
WHERE topic0 = 0xbc769889246686134856b409155bb87630ea5797a705fa98b61f576d316aab9b
  AND contract_address IN (
    0xd3e6775ed9b7dc12b205c8e608dc3767b9e5efda,
    0x4ccb0bb02fcaba27e82a56646e81d8c5bc4119a5,
    0xa7d2607c6bd39ae9521e514026cbb078405ab322
  )
  AND block_time >= from_unixtime({{start}})
  AND block_time <  from_unixtime({{end}})
