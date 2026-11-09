export const ASSET_TRANSFERRED_EVENT =
    "event AssetTransferred(address indexed _portfolio, uint8 _actionType, int256 _amountIn)";
export const TRANSFER_EVENT =
    "event Transfer(address indexed from, address indexed to, uint256 value)";

const COMMISSION_FEE = 3n;

type PositionedLog = {
    transactionHash?: string;
    logIndex?: number | string;
    index?: number | string;
    log_index?: number | string;
    args: Record<string, any>;
};

/**
 * BasePortfolio transfers the vault cut, then the operation cut, immediately before
 * CommonHelper.logTradingFee. Read that exact sequence, not every transfer in the tx:
 * PnL, funding, margin movements and other fills may use the same recipients.
 * https://github.com/drxprotocol/drxtrade_v2/blob/dev/src/utils/BasePortfolio.sol
 *
 * Callers pass AUSD Transfer logs from getLogs, not full receipts. A missing log index
 * is some other event between the transfer and the commission, so the walk stops there.
 */
export function attributeCommissions(
    commissions: readonly PositionedLog[],
    transfers: readonly PositionedLog[],
    vault: string,
) {
    const vaultAddress = vault.toLowerCase();
    const transfersByTx = new Map<string, Map<number, PositionedLog>>();
    for (const transfer of transfers) {
        const hash = txHash(transfer);
        const indexes = transfersByTx.get(hash) ?? new Map<number, PositionedLog>();
        indexes.set(logIndex(transfer), transfer);
        transfersByTx.set(hash, indexes);
    }

    const allocations: Array<{ vaultAmount: bigint; revenue: bigint }> = [];
    for (const commission of commissions) {
        if (BigInt(commission.args._actionType) !== COMMISSION_FEE) continue;
        const hash = txHash(commission);
        const index = logIndex(commission);
        const portfolio = String(commission.args._portfolio).toLowerCase();
        const signed = BigInt(commission.args._amountIn);
        const amount = signed < 0n ? -signed : signed;
        const indexes = transfersByTx.get(hash) ?? new Map<number, PositionedLog>();

        let matched = 0n;
        let vaultAmount = 0n;
        // At most two transfers: vault and operator. Either can be zero/omitted.
        for (let previous = index - 1; matched < amount && previous >= index - 2 && previous >= 0; previous--) {
            const transferLog = indexes.get(previous);
            if (!transferLog) break;
            if (String(transferLog.args.from).toLowerCase() !== portfolio) break;
            const value = BigInt(transferLog.args.value);
            matched += value;
            if (String(transferLog.args.to).toLowerCase() === vaultAddress) vaultAmount += value;
        }
        if (matched !== amount)
            throw new Error(`Drake commission transfers do not reconcile for ${portfolio} at log ${index} in ${hash}: ${matched} != ${amount}`);
        allocations.push({ vaultAmount, revenue: amount - vaultAmount });
    }
    return allocations;
}

function txHash(log: PositionedLog) {
    const hash = log.transactionHash;
    if (!hash) throw new Error("Drake log is missing transactionHash");
    return hash.toLowerCase();
}

function logIndex(log: PositionedLog) {
    const index = Number(log.logIndex ?? log.log_index ?? log.index);
    if (!Number.isFinite(index)) throw new Error(`Drake log ${log.transactionHash} is missing logIndex`);
    return index;
}
