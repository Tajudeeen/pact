export const RELEASE = {
  network: "tokyo-testnet",
  chainId: 50383,
  mainnetEnabled: false,
  mainnetStatus: "blocked",
  blockers: [
    "Published mainnet perps contracts, SDK compatibility and verified deployment identities",
    "Actual testnet entry and close hashes with matching fills and recovery evidence",
    "Protocol-enforced reduce-only closing or an independently qualified alternative",
    "Verified exit protection, revocation and operator compromise recovery",
    "Complete trading-fee, funding and native-gas attribution",
    "Wallet and mobile qualification, backup/recovery drill and independent security review",
    "Explicit authorization for a bounded real-money pilot",
  ],
} as const;
export function assertExecutionNetwork(network = "tokyo-testnet") {
  if (network !== RELEASE.network)
    throw new Error(
      "Mainnet execution is not supported or qualified in this release. Tokyo testnet is the only enabled network.",
    );
}
