import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  createSolanaDevnet,
  MobileWalletProvider,
  useMobileWallet,
} from "@wallet-ui/react-native-kit";

import { demoTask } from "./src/demo/task";
import {
  capturePhotoEvidence,
  type CapturedPhotoEvidence,
} from "./src/evidence/capture";
import type { RelayTask } from "./src/protocol/types";
import {
  fetchGroundRelayTask,
  getClaimTaskInstruction,
  getReleasePaymentInstruction,
  getSubmitEvidenceInstruction,
} from "./src/solana/ground-relay";
import {
  didExpectedTransitionLand,
  type RelayTransitionOperation,
} from "./src/solana/reconcile";

const cluster = createSolanaDevnet({
  url: "https://api.devnet.solana.com",
});

const identity = {
  name: "Ground Relay",
  uri: "https://github.com/uknwplayer/ground-relay",
  icon: "favicon.png",
};

function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function shortHash(value: string): string {
  if (value.length < 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-10)}`;
}

function RelayScreen() {
  const { account, connect, disconnect, client, sendTransactions } = useMobileWallet();
  const [task, setTask] = useState<RelayTask>(demoTask);
  const [claimSignature, setClaimSignature] = useState<string>();
  const [deliverySignature, setDeliverySignature] = useState<string>();
  const [payoutSignature, setPayoutSignature] = useState<string>();
  const [capturedEvidence, setCapturedEvidence] =
    useState<CapturedPhotoEvidence>();
  const [busy, setBusy] = useState(false);
  const [chainError, setChainError] = useState<string>();

  const walletAddress = account?.address?.toString();
  const canClaim = task.status === "open" && Boolean(walletAddress);
  const canCapture = task.status === "claimed" && Boolean(walletAddress);
  const canSubmit =
    task.status === "claimed" && Boolean(walletAddress) && Boolean(capturedEvidence);
  const canRelease =
    task.status === "accepted" &&
    Boolean(walletAddress) &&
    task.worker === walletAddress;

  const criteriaDone = useMemo(
    () => task.criteria.filter((criterion) => criterion.required).length,
    [task.criteria],
  );

  async function refreshTask() {
    try {
      const onChain = await fetchGroundRelayTask(client.rpc as never);
      setTask((current) => ({
        ...current,
        poster: onChain.poster,
        worker: onChain.worker,
        status: onChain.status,
        rewardAtomic: onChain.rewardAtomic,
        rewardMint: onChain.mint,
        evidenceHash: onChain.evidenceHash,
      }));
      setChainError(undefined);
      return onChain;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read devnet task";
      setChainError(message);
      return undefined;
    }
  }

  async function reconcileExpectedTransition(
    operation: RelayTransitionOperation,
    expectedEvidenceHash?: string,
  ) {
    if (!walletAddress) return false;

    const onChain = await refreshTask();
    if (!onChain) return false;

    return didExpectedTransitionLand({
      operation,
      status: onChain.status,
      worker: onChain.worker,
      walletAddress,
      evidenceHash: onChain.evidenceHash,
      expectedEvidenceHash,
    });
  }

  async function waitForConfirmation(signature: string) {
    const rpc = client.rpc as unknown as {
      getSignatureStatuses: (
        signatures: string[],
      ) => {
        send: () => Promise<{
          value: Array<
            | {
                err: unknown;
                confirmationStatus?: "processed" | "confirmed" | "finalized";
              }
            | null
          >;
        }>;
      };
    };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await rpc.getSignatureStatuses([signature]).send();
      const status = response.value[0];

      if (status?.err) {
        throw new Error("Solana confirmed the transaction with an error.");
      }

      if (
        status?.confirmationStatus === "confirmed" ||
        status?.confirmationStatus === "finalized"
      ) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    throw new Error(
      "Transaction was submitted, but devnet confirmation timed out. Refresh the on-chain task before retrying.",
    );
  }

  useEffect(() => {
    void refreshTask();
  }, [client]);

  async function connectWallet() {
    setBusy(true);
    try {
      await connect();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wallet connection failed";
      Alert.alert("Wallet connection failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnectWallet() {
    setBusy(true);
    try {
      await disconnect();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wallet disconnect failed";
      Alert.alert("Wallet disconnect failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function claimTask() {
    if (!walletAddress || !canClaim) return;

    setBusy(true);
    try {
      const nextSignature = await sendTransactions([
        getClaimTaskInstruction(walletAddress),
      ]);

      const signature = nextSignature.toString();
      setClaimSignature(signature);
      await waitForConfirmation(signature);
      await refreshTask();
    } catch (error) {
      if (await reconcileExpectedTransition("claim")) return;

      const message =
        error instanceof Error ? error.message : "Wallet transaction failed";
      Alert.alert("Claim failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function captureEvidence() {
    if (!canCapture) return;

    setBusy(true);
    try {
      const evidence = await capturePhotoEvidence(task.id);
      if (evidence) {
        setCapturedEvidence(evidence);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Evidence capture failed";
      Alert.alert("Evidence capture failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEvidence() {
    if (!walletAddress || !capturedEvidence || !canSubmit) return;
    const evidenceHash = capturedEvidence.sha256;

    setBusy(true);
    try {
      const nextSignature = await sendTransactions([
        getSubmitEvidenceInstruction(walletAddress, evidenceHash),
      ]);

      const signature = nextSignature.toString();
      setDeliverySignature(signature);
      await waitForConfirmation(signature);
      await refreshTask();
    } catch (error) {
      if (await reconcileExpectedTransition("submitEvidence", evidenceHash)) return;

      const message =
        error instanceof Error ? error.message : "Evidence submission failed";
      Alert.alert("Delivery failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function releasePayout() {
    if (!walletAddress || !canRelease) return;

    setBusy(true);
    try {
      const nextSignature = await sendTransactions([
        getReleasePaymentInstruction(walletAddress),
      ]);

      const signature = nextSignature.toString();
      setPayoutSignature(signature);
      await waitForConfirmation(signature);
      await refreshTask();
    } catch (error) {
      if (await reconcileExpectedTransition("releasePayment")) return;

      const message =
        error instanceof Error ? error.message : "Escrow payout failed";
      Alert.alert("Payout failed", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CLOCK IN · SOLANA MOBILE</Text>
          <Text style={styles.title}>Ground Relay</Text>
          <Text style={styles.subtitle}>
            Human-in-the-loop execution for autonomous agents.
          </Text>
        </View>

        <View style={styles.walletCard}>
          <View>
            <Text style={styles.label}>WORKER WALLET</Text>
            <Text style={styles.walletText}>
              {walletAddress ? shortAddress(walletAddress) : "Not connected"}
            </Text>
          </View>
          <Pressable
            style={[styles.secondaryButton, busy && styles.disabled]}
            disabled={busy}
            onPress={walletAddress ? disconnectWallet : connectWallet}
          >
            <Text style={styles.secondaryButtonText}>
              {walletAddress ? "Disconnect" : "Connect"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.taskCard}>
          <View style={styles.taskHeader}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{task.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.reward}>0.001 WSOL</Text>
          </View>

          <Text style={styles.taskTitle}>{task.title}</Text>
          <Text style={styles.taskDescription}>{task.description}</Text>

          <Text style={styles.label}>ACCEPTANCE CRITERIA</Text>
          <View style={styles.criteria}>
            {task.criteria.map((criterion) => (
              <View key={criterion.id} style={styles.criterion}>
                <Text style={styles.bullet}>✓</Text>
                <Text style={styles.criterionText}>{criterion.description}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.meta}>
            {criteriaDone} required checks · task {task.id}
          </Text>

          {claimSignature ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>ANCHOR CLAIM RECEIPT · DEVNET</Text>
              <Text selectable style={styles.receiptText}>
                {claimSignature}
              </Text>
            </View>
          ) : null}

          {task.status === "open" ? (
            <Pressable
              style={[
                styles.primaryButton,
                (!canClaim || busy) && styles.disabled,
              ]}
              disabled={!canClaim || busy}
              onPress={claimTask}
            >
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {walletAddress
                    ? "Claim funded task on Solana devnet"
                    : "Connect wallet to claim"}
                </Text>
              )}
            </Pressable>
          ) : null}

          {task.status === "claimed" ? (
            <>
              {capturedEvidence ? (
                <View style={styles.evidenceCard}>
                  <Image
                    source={{ uri: capturedEvidence.uri }}
                    style={styles.evidenceImage}
                  />
                  <View style={styles.evidenceMeta}>
                    <Text style={styles.label}>EVIDENCE SHA-256</Text>
                    <Text selectable style={styles.hashText}>
                      {capturedEvidence.sha256}
                    </Text>
                    <Text style={styles.meta}>
                      {capturedEvidence.width}×{capturedEvidence.height}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Pressable
                style={[styles.secondaryAction, busy && styles.disabled]}
                disabled={!canCapture || busy}
                onPress={captureEvidence}
              >
                <Text style={styles.secondaryActionText}>
                  {capturedEvidence ? "Retake evidence photo" : "Capture evidence photo"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.primaryButton,
                  (!canSubmit || busy) && styles.disabled,
                ]}
                disabled={!canSubmit || busy}
                onPress={submitEvidence}
              >
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Submit evidence to Anchor on devnet
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}

          {task.status === "delivered" && task.evidenceHash ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>ANCHOR DELIVERY · DEVNET</Text>
              <Text style={styles.receiptText}>
                evidence {shortHash(task.evidenceHash)}
              </Text>
              {deliverySignature ? (
                <Text selectable style={styles.receiptText}>
                  {deliverySignature}
                </Text>
              ) : null}
            </View>
          ) : null}

          {task.status === "accepted" ? (
            <>
              <View style={styles.receipt}>
                <Text style={styles.label}>DELIVERY ACCEPTED · DEVNET</Text>
                <Text style={styles.receiptText}>
                  Escrow payout is ready for the assigned worker.
                </Text>
              </View>

              <Pressable
                style={[
                  styles.primaryButton,
                  (!canRelease || busy) && styles.disabled,
                ]}
                disabled={!canRelease || busy}
                onPress={releasePayout}
              >
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Release 0.001 WSOL payout
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}

          {task.status === "paid" ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>ESCROW PAID · DEVNET</Text>
              <Text style={styles.receiptText}>
                0.001 WSOL released to the worker token account.
              </Text>
              {payoutSignature ? (
                <Text selectable style={styles.receiptText}>
                  {payoutSignature}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Pressable style={styles.resetButton} onPress={() => void refreshTask()}>
            <Text style={styles.resetText}>Refresh on-chain task</Text>
          </Pressable>
        </View>

        {chainError ? (
          <Text style={styles.chainError}>Devnet read: {chainError}</Text>
        ) : null}

        <Text style={styles.footer}>
          Live path: funded escrow → wallet claim → camera evidence → SHA-256 →
          Anchor delivery → verifier acceptance → worker payout. Next: agent resume.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <MobileWalletProvider cluster={cluster} identity={identity}>
      <RelayScreen />
    </MobileWalletProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#070a08",
  },
  content: {
    padding: 20,
    gap: 18,
  },
  hero: {
    gap: 6,
    paddingTop: 12,
  },
  eyebrow: {
    color: "#78f7a4",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
  },
  subtitle: {
    color: "#aab3ad",
    fontSize: 16,
    lineHeight: 23,
  },
  walletCard: {
    alignItems: "center",
    backgroundColor: "#101713",
    borderColor: "#26372d",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  label: {
    color: "#789184",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  walletText: {
    color: "#eef7f0",
    fontSize: 14,
    marginTop: 5,
  },
  secondaryButton: {
    borderColor: "#4f6d59",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#aefbc7",
    fontWeight: "700",
  },
  taskCard: {
    backgroundColor: "#111713",
    borderColor: "#2a3f31",
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  taskHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusPill: {
    backgroundColor: "#183a24",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: "#79f19f",
    fontSize: 11,
    fontWeight: "800",
  },
  reward: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  taskTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  taskDescription: {
    color: "#b6c0b9",
    fontSize: 15,
    lineHeight: 22,
  },
  criteria: {
    gap: 9,
  },
  criterion: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  bullet: {
    color: "#72f39d",
    fontWeight: "800",
  },
  criterionText: {
    color: "#e4ebe6",
    flex: 1,
    lineHeight: 20,
  },
  meta: {
    color: "#748078",
    fontSize: 12,
  },
  receipt: {
    backgroundColor: "#08110b",
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  receiptText: {
    color: "#9bd8ac",
    fontFamily: "monospace",
    fontSize: 11,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#71f29a",
    borderRadius: 14,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#071109",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: "#4f6d59",
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    color: "#baf9ce",
    fontSize: 14,
    fontWeight: "800",
  },
  evidenceCard: {
    backgroundColor: "#0a100c",
    borderRadius: 14,
    overflow: "hidden",
  },
  evidenceImage: {
    height: 220,
    width: "100%",
  },
  evidenceMeta: {
    gap: 6,
    padding: 12,
  },
  hashText: {
    color: "#9bd8ac",
    fontFamily: "monospace",
    fontSize: 10,
  },
  disabled: {
    opacity: 0.45,
  },
  resetButton: {
    alignItems: "center",
    paddingVertical: 5,
  },
  resetText: {
    color: "#93a298",
    fontSize: 12,
  },
  chainError: {
    color: "#d6a96f",
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  footer: {
    color: "#67746c",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
    paddingBottom: 24,
  },
});
