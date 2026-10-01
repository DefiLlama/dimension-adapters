import { Interface } from "ethers";

export const ASSET_TRANSFERRED_EVENT =
    "event AssetTransferred(address indexed _portfolio, uint8 _actionType, int256 _amountIn)";
const feeInterface = new Interface([ASSET_TRANSFERRED_EVENT]);
const tokenInterface = new Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const feeTopic = feeInterface.getEvent("AssetTransferred")!.topicHash;
const transferTopic = tokenInterface.getEvent("Transfer")!.topicHash;

type ReceiptLog = { address: string; topics: readonly string[]; data: string };

/**
 * BasePortfolio transfers the vault cut, then the operation cut, immediately before
 * CommonHelper.logTradingFee. Read that exact sequence, not every transfer in the tx:
 * PnL, funding, margin movements and other fills may use the same recipients.
 * https://github.com/drxprotocol/drxtrade_v2/blob/dev/src/utils/BasePortfolio.sol
 */
export function getCommissionTransfers(
    logs: readonly ReceiptLog[],
    token: string,
    commonHelper: string,
    vault: string,
) {
    const allocations: Array<{ portfolio: string; amount: bigint; vaultAmount: bigint; revenue: bigint }> = [];
    for (let index = 0; index < logs.length; index++) {
        const log = logs[index];
        if (log.address.toLowerCase() !== commonHelper.toLowerCase() || log.topics[0] !== feeTopic) continue;
        const args = feeInterface.parseLog(log)!.args;
        if (BigInt(args._actionType) !== 3n) continue;
        const signed = BigInt(args._amountIn);
        const amount = signed < 0n ? -signed : signed;
        const portfolio = String(args._portfolio).toLowerCase();
        let matched = 0n;
        let vaultAmount = 0n;
        // At most two transfers: vault and operator. Either can be zero/omitted.
        for (let previous = index - 1; matched < amount && previous >= index - 2 && previous >= 0; previous--) {
            const transferLog = logs[previous];
            if (transferLog.address.toLowerCase() !== token.toLowerCase() || transferLog.topics[0] !== transferTopic) break;
            const transfer = tokenInterface.parseLog(transferLog)!.args;
            if (String(transfer.from).toLowerCase() !== portfolio) break;
            const value = BigInt(transfer.value);
            matched += value;
            if (String(transfer.to).toLowerCase() === vault.toLowerCase()) vaultAmount += value;
        }
        if (matched !== amount)
            throw new Error(`Drake commission transfers do not reconcile for ${portfolio} at receipt log ${index}: ${matched} != ${amount}`);
        allocations.push({ portfolio, amount, vaultAmount, revenue: amount - vaultAmount });
    }
    return allocations;
}
