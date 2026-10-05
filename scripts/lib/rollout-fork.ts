import {
  Contract, Interface, JsonRpcProvider, ZeroAddress, ZeroHash, concat, getAddress,
  getBytes, isHexString, keccak256, parseEther, solidityPacked, toQuantity, toUtf8Bytes, zeroPadValue,
} from "ethers";

export interface SafeBuilderBatch {
  chainId: string | number;
  meta: { createdFromSafeAddress: string; [key: string]: unknown };
  transactions: Array<{ to: string; value: string; data: string | null; operation?: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

const SAFE_ABI = [
  "function VERSION() view returns(string)",
  "function getOwners() view returns(address[])",
  "function getThreshold() view returns(uint256)",
  "function nonce() view returns(uint256)",
  "function approveHash(bytes32 hashToApprove)",
  "function approvedHashes(address owner,bytes32 hash) view returns(uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns(bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool success)",
  "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
  "event ExecutionFailure(bytes32 txHash,uint256 payment)",
];
const MULTISEND = [
  { address: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D", hash: "0xa9865ac2d9c7a1591619b188c4d88167b50df6cc0c5327fcbd1c8c75f7c066ad" },
  { address: "0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B", hash: "0xa9865ac2d9c7a1591619b188c4d88167b50df6cc0c5327fcbd1c8c75f7c066ad" },
  { address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2", hash: "0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939" },
];

/** Never send impersonation, balance changes, approvals, or execTransaction to a remote RPC. */
export async function assertLocalAnvilFork(provider: JsonRpcProvider, expectedChainId?: number) {
  const url = new URL(provider._getConnection().url);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Fork mutation requires a loopback HTTP Anvil RPC");
  }
  const [clientVersion, chainId, nodeInfo] = await Promise.all([
    provider.send("web3_clientVersion", []), provider.send("eth_chainId", []), provider.send("anvil_nodeInfo", []),
  ]);
  if (!/^anvil\//i.test(clientVersion)) throw new Error(`Local RPC is not Anvil: ${clientVersion}`);
  if (!nodeInfo.forkConfig || nodeInfo.forkConfig.forkBlockNumber === undefined || nodeInfo.forkConfig.forkBlockNumber === null) {
    throw new Error("Anvil must be started from an explicitly pinned mainnet fork");
  }
  if (expectedChainId !== undefined && Number(chainId) !== expectedChainId) {
    throw new Error(`Fork chain ${Number(chainId)} does not match expected ${expectedChainId}`);
  }
  return { chainId: Number(chainId), clientVersion, forkBlockNumber: Number(nodeInfo.forkConfig.forkBlockNumber) };
}

/** Execute the exact imported calls through the live Safe implementation and real threshold checks. */
export async function executeSafeBuilderBatch(provider: JsonRpcProvider, batch: SafeBuilderBatch) {
  const fork = await assertLocalAnvilFork(provider, Number(batch.chainId));
  if (!batch.transactions.length) throw new Error("Safe batch is empty");
  const safeAddress = getAddress(batch.meta.createdFromSafeAddress);
  if (await provider.getCode(safeAddress) === "0x") throw new Error(`Safe ${safeAddress} is not deployed`);
  const safe = new Contract(safeAddress, SAFE_ABI, provider);
  const [version, ownersResult, thresholdValue, nonce, guardStorage] = await Promise.all([
    safe.VERSION(), safe.getOwners(), safe.getThreshold(), safe.nonce(),
    provider.getStorage(safeAddress, keccak256(toUtf8Bytes("guard_manager.guard.address"))),
  ]);
  const owners = [...ownersResult].map(getAddress).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const threshold = Number(thresholdValue);
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > owners.length) throw new Error("Invalid Safe threshold");
  const guard = getAddress(`0x${guardStorage.slice(-40)}`);
  // Guards remain installed and run inside the Safe. Never edit Safe storage or bypass its checks.
  let multiSend: typeof MULTISEND[number] | undefined;
  for (const candidate of MULTISEND) {
    const code = await provider.getCode(candidate.address);
    if (code !== "0x" && keccak256(code) === candidate.hash) { multiSend = candidate; break; }
  }
  if (!multiSend) throw new Error("No verified MultiSendCallOnly deployment on this fork");
  const packed = concat(batch.transactions.map((tx, index) => {
    if ((tx.operation ?? 0) !== 0) throw new Error(`Safe Builder transaction ${index} is not CALL`);
    if (tx.data === null || !isHexString(tx.data, true)) throw new Error(`Transaction ${index} requires exact encoded calldata`);
    if (BigInt(tx.value) < 0n) throw new Error(`Transaction ${index} has negative value`);
    return solidityPacked(["uint8", "address", "uint256", "uint256", "bytes"],
      [0, getAddress(tx.to), BigInt(tx.value), getBytes(tx.data).length, tx.data]);
  }));
  const multiSendInterface = new Interface(["function multiSend(bytes transactions)"]);
  const data = multiSendInterface.encodeFunctionData("multiSend", [packed]);
  const safeArgs = [multiSend.address, 0n, data, 1, 0n, 0n, 0n, ZeroAddress, ZeroAddress] as const;
  const safeTxHash = await safe.getTransactionHash(...safeArgs, nonce);
  const approvedOwners = owners.slice(0, threshold);
  const approvalTransactions: string[] = [];
  for (const owner of approvedOwners) {
    await provider.send("anvil_setBalance", [owner, toQuantity(parseEther("1000"))]);
    await provider.send("anvil_impersonateAccount", [owner]);
    try {
      const signedSafe = new Contract(safeAddress, SAFE_ABI, await provider.getSigner(owner));
      const approval = await signedSafe.approveHash(safeTxHash);
      const receipt = await approval.wait();
      if (!receipt || receipt.status !== 1 || await safe.approvedHashes(owner, safeTxHash) !== 1n) {
        throw new Error(`Safe hash approval failed for ${owner}`);
      }
      approvalTransactions.push(approval.hash);
    } finally {
      await provider.send("anvil_stopImpersonatingAccount", [owner]);
    }
  }
  // Safe v=1 signatures reference on-chain approvals, in ascending signer-address order.
  const signatures = concat(approvedOwners.map((owner) => concat([zeroPadValue(owner, 32), ZeroHash, "0x01"])));
  const executor = approvedOwners[0];
  await provider.send("anvil_impersonateAccount", [executor]);
  try {
    const signedSafe = new Contract(safeAddress, SAFE_ABI, await provider.getSigner(executor));
    if (!await signedSafe.execTransaction.staticCall(...safeArgs, signatures)) throw new Error("Safe simulation returned false");
    const gasEstimate = await signedSafe.execTransaction.estimateGas(...safeArgs, signatures);
    const tx = await signedSafe.execTransaction(...safeArgs, signatures, { gasLimit: gasEstimate * 12n / 10n });
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Safe execution transaction reverted");
    const events = receipt.logs.filter((log: { address: string }) => log.address.toLowerCase() === safeAddress.toLowerCase())
      .map((log: any) => { try { return safe.interface.parseLog(log); } catch { return null; } });
    if (events.some((event: any) => event?.name === "ExecutionFailure") ||
        !events.some((event: any) => event?.name === "ExecutionSuccess" && event.args.txHash === safeTxHash)) {
      throw new Error("Safe did not emit ExecutionSuccess for the exact batch hash");
    }
    const nonceAfter = await safe.nonce();
    if (nonceAfter !== nonce + 1n) throw new Error("Safe nonce did not advance exactly once");
    return {
      chainId: fork.chainId, forkBlockNumber: fork.forkBlockNumber, safeAddress, version, owners, threshold, guard,
      nonceBefore: nonce.toString(), nonceAfter: nonceAfter.toString(), approvedOwners, approvalTransactions,
      multiSend: multiSend.address, multiSendCodeHash: multiSend.hash, packedTransactionsHash: keccak256(packed),
      safeTxHash, executionTransactionHash: tx.hash, gasUsed: receipt.gasUsed.toString(),
      transactionCount: batch.transactions.length, success: true,
      authorization: "Local-fork impersonated owner approvals; real Safe threshold and guard execution; no production signatures",
    };
  } finally {
    await provider.send("anvil_stopImpersonatingAccount", [executor]);
  }
}
