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

import {
  capturePhotoEvidence,
  type CapturedPhotoEvidence,
} from "./src/evidence/capture";
import { fetchTaskInbox } from "./src/inbox/api";
import { resolveGatewayBaseUrl } from "./src/inbox/config";
import {
  buildRestartPlan,
  mergeFreshInbox,
  selectTaskSession,
} from "./src/inbox/flow";
import { HistoryView } from "./src/inbox/HistoryView";
import {
  deriveActionEligibility,
  reconcileSelectedTask,
  type ReconciledTaskState,
} from "./src/inbox/reconcile";
import { loadMobileState, saveMobileState } from "./src/inbox/storage";
import type {
  InboxTaskSummary,
  MobileStateV1,
  SelectedTaskSession,
} from "./src/inbox/types";
import {
  fetchGroundRelayTask,
  getClaimTaskInstruction,
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

function shortAddress(value: string): string {
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function shortHash(value: string): string {
  if (value.length < 22) return value;
  return `${value.slice(0, 10)}…${value.slice(-10)}`;
}

function formatReward(task: InboxTaskSummary): string {
  return `${task.rewardAtomic} atomic · ${shortAddress(task.rewardMint)}`;
}

function mobileState(
  inboxSnapshot: InboxTaskSummary[],
  selectedTask?: SelectedTaskSession,
): MobileStateV1 {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    inboxSnapshot,
    selectedTask,
  };
}

function RelayScreen() {
  const { account, connect, disconnect, client, sendTransactions } = useMobileWallet();
  const [inbox, setInbox] = useState<InboxTaskSummary[]>([]);
  const [session, setSession] = useState<SelectedTaskSession>();
  const [authoritative, setAuthoritative] = useState<ReconciledTaskState>();
  const [capturedEvidence, setCapturedEvidence] =
    useState<CapturedPhotoEvidence>();
  const [inboxSource, setInboxSource] =
    useState<"loading" | "cached" | "fresh" | "unavailable">("loading");
  const [gatewayError, setGatewayError] = useState<string>();
  const [chainError, setChainError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selectedView, setSelectedView] = useState<"task" | "history">("task");

  const gatewayBaseUrl = useMemo(() => resolveGatewayBaseUrl(), []);
  const walletAddress = account?.address?.toString();
  const selectedTask = useMemo(
    () => inbox.find((task) => task.id === session?.taskId),
    [inbox, session?.taskId],
  );

  const eligibility = useMemo(
    () =>
      selectedTask
        ? deriveActionEligibility({
            summary: selectedTask,
            authoritative,
            walletAddress,
            hasCapturedEvidence: Boolean(capturedEvidence),
            payoutContext: undefined,
          })
        : {
            canClaim: false,
            canCapture: false,
            canSubmit: false,
            canRelease: false,
          },
    [selectedTask, authoritative, walletAddress, capturedEvidence],
  );

  const displayStatus = authoritative?.status ?? selectedTask?.status;
  const displayWorker = authoritative?.worker ?? selectedTask?.worker;

  async function persist(
    nextInbox: InboxTaskSummary[] = inbox,
    nextSession: SelectedTaskSession | undefined = session,
  ) {
    try {
      await saveMobileState(mobileState(nextInbox, nextSession));
    } catch {
      // Storage is a restart convenience layer only. Never block protocol actions on it.
    }
  }

  async function refreshInbox(
    baseInbox: InboxTaskSummary[] = inbox,
    baseSession: SelectedTaskSession | undefined = session,
  ) {
    if (!gatewayBaseUrl) {
      setGatewayError(
        "Gateway URL is not configured. Set EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL to the /v1 base URL.",
      );
      setInboxSource(baseInbox.length > 0 ? "cached" : "unavailable");
      return;
    }

    try {
      const fresh = await fetchTaskInbox(gatewayBaseUrl);
      const merged = mergeFreshInbox(
        mobileState(baseInbox, baseSession),
        fresh,
        new Date().toISOString(),
      );
      setAuthoritative(undefined);
      setInbox(fresh);
      setSession(merged.selectedTask);
      setInboxSource("fresh");
      setGatewayError(undefined);
      await persist(fresh, merged.selectedTask);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gateway inbox unavailable";
      setGatewayError(message);
      setInboxSource(baseInbox.length > 0 ? "cached" : "unavailable");
    }
  }

  async function refreshSelectedTask(
    summary: InboxTaskSummary | undefined = selectedTask,
  ) {
    setAuthoritative(undefined);

    if (!summary?.chain?.taskPda) {
      setChainError(
        summary ? "Not yet executable on-chain: no task binding." : undefined,
      );
      return undefined;
    }

    try {
      const onChain = await fetchGroundRelayTask(
        client.rpc as never,
        summary.chain.taskPda,
      );
      const reconciled = reconcileSelectedTask(summary, onChain);
      setAuthoritative(reconciled);
      setChainError(undefined);
      return onChain;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read selected devnet task";
      setChainError(message);
      return undefined;
    }
  }

  async function updateSession(
    patch: Partial<
      Pick<
        SelectedTaskSession,
        | "claimSignature"
        | "deliverySignature"
        | "payoutSignature"
        | "expectedEvidenceHash"
      >
    >,
  ) {
    if (!selectedTask) return;
    const next = {
      ...(session ?? selectTaskSession(selectedTask, new Date().toISOString())),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setSession(next);
    await persist(inbox, next);
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const cached = await loadMobileState();
      if (cancelled) return;

      const plan = buildRestartPlan(cached);
      setInbox(cached.inboxSnapshot);
      setSession(plan.session);
      setInboxSource(cached.inboxSnapshot.length > 0 ? "cached" : "loading");

      await refreshInbox(cached.inboxSnapshot, plan.session);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCapturedEvidence(undefined);
    setAuthoritative(undefined);
    setChainError(undefined);

    if (selectedTask) {
      void refreshSelectedTask(selectedTask);
    }
  }, [
    client,
    selectedTask?.id,
    selectedTask?.chain?.taskPda,
    selectedTask?.chain?.programId,
    selectedTask?.poster,
    selectedTask?.rewardAtomic,
    selectedTask?.rewardMint,
    selectedTask?.status,
  ]);

  async function chooseTask(task: InboxTaskSummary) {
    const next = selectTaskSession(task, new Date().toISOString());
    setSelectedView("task");
    setSession(next);
    setCapturedEvidence(undefined);
    setAuthoritative(undefined);
    setChainError(undefined);
    await persist(inbox, next);
  }

  async function clearSelection() {
    setSelectedView("task");
    setSession(undefined);
    setAuthoritative(undefined);
    setCapturedEvidence(undefined);
    setChainError(undefined);
    await persist(inbox, undefined);
  }

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
      "Transaction was submitted, but devnet confirmation timed out. Refresh the selected task before retrying.",
    );
  }

  async function reconcileExpectedTransition(
    operation: RelayTransitionOperation,
    expectedEvidenceHash?: string,
  ) {
    if (!walletAddress || !selectedTask) return false;
    const onChain = await refreshSelectedTask(selectedTask);
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

  async function claimTask() {
    if (
      !walletAddress ||
      !selectedTask ||
      !authoritative ||
      !eligibility.canClaim
    ) {
      return;
    }

    setBusy(true);
    try {
      const nextSignature = await sendTransactions([
        getClaimTaskInstruction(walletAddress, authoritative.taskPda),
      ]);
      const signature = nextSignature.toString();
      await updateSession({ claimSignature: signature });
      await waitForConfirmation(signature);
      await refreshSelectedTask(selectedTask);
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
    if (!selectedTask || !eligibility.canCapture) return;

    setBusy(true);
    try {
      const evidence = await capturePhotoEvidence(selectedTask.id);
      if (evidence) setCapturedEvidence(evidence);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Evidence capture failed";
      Alert.alert("Evidence capture failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEvidence() {
    if (
      !walletAddress ||
      !selectedTask ||
      !authoritative ||
      !capturedEvidence ||
      !eligibility.canSubmit
    ) {
      return;
    }

    const evidenceHash = capturedEvidence.sha256;
    setBusy(true);
    try {
      await updateSession({ expectedEvidenceHash: evidenceHash });
      const nextSignature = await sendTransactions([
        getSubmitEvidenceInstruction(
          walletAddress,
          authoritative.taskPda,
          evidenceHash,
        ),
      ]);
      const signature = nextSignature.toString();
      await updateSession({
        deliverySignature: signature,
        expectedEvidenceHash: evidenceHash,
      });
      await waitForConfirmation(signature);
      await refreshSelectedTask(selectedTask);
    } catch (error) {
      if (
        await reconcileExpectedTransition("submitEvidence", evidenceHash)
      ) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Evidence submission failed";
      Alert.alert("Delivery failed", message);
    } finally {
      setBusy(false);
    }
  }

  const walletCard = (
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
  );

  if (!selectedTask) {
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

          {walletCard}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Task inbox</Text>
              <Text style={styles.meta}>
                {inboxSource === "fresh"
                  ? "Live Gateway snapshot"
                  : inboxSource === "cached"
                    ? "Cached snapshot · Gateway refresh unavailable"
                    : inboxSource === "loading"
                      ? "Loading Gateway…"
                      : "Gateway unavailable"}
              </Text>
            </View>
            <Pressable
              style={[styles.secondaryButton, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void refreshInbox()}
            >
              <Text style={styles.secondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>

          {inboxSource === "loading" ? <ActivityIndicator /> : null}

          {inbox.map((task) => (
            <Pressable
              key={task.id}
              style={styles.taskCard}
              onPress={() => void chooseTask(task)}
            >
              <View style={styles.taskHeader}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{task.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.reward}>{formatReward(task)}</Text>
              </View>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.taskDescription}>{task.description}</Text>
              <Text style={styles.meta}>
                {task.chain?.taskPda
                  ? `Bound · ${shortAddress(task.chain.taskPda)}`
                  : "Not yet executable on-chain"}
              </Text>
            </Pressable>
          ))}

          {inbox.length === 0 && inboxSource !== "loading" ? (
            <View style={styles.emptyCard}>
              <Text style={styles.taskDescription}>No tasks available.</Text>
            </View>
          ) : null}

          {gatewayError ? (
            <Text style={styles.warning}>Gateway: {gatewayError}</Text>
          ) : null}

          <Text style={styles.footer}>
            Gateway discovers tasks. Solana devnet remains authoritative for task
            state and execution.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedView === "history") {
    return (
      <HistoryView
        summary={selectedTask}
        session={session}
        authoritative={authoritative}
        chainError={chainError}
        onBack={() => setSelectedView("task")}
        onRefresh={() => void refreshSelectedTask(selectedTask)}
      />
    );
  }

  const criteriaDone = selectedTask.criteria.filter(
    (criterion) => criterion.required,
  ).length;
  const claimSignature = session?.claimSignature;
  const deliverySignature = session?.deliverySignature;
  const payoutSignature = session?.payoutSignature;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Pressable onPress={() => void clearSelection()}>
            <Text style={styles.backText}>← Task inbox</Text>
          </Pressable>
          <Text style={styles.eyebrow}>CLOCK IN · SOLANA MOBILE</Text>
          <Text style={styles.title}>Ground Relay</Text>
        </View>

        {walletCard}

        <View style={styles.taskCard}>
          <View style={styles.taskHeader}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                {(displayStatus ?? "unknown").toUpperCase()}
              </Text>
            </View>
            <Text style={styles.reward}>{formatReward(selectedTask)}</Text>
          </View>

          <Text style={styles.taskTitle}>{selectedTask.title}</Text>
          <Text style={styles.taskDescription}>{selectedTask.description}</Text>

          <Text style={styles.label}>ACCEPTANCE CRITERIA</Text>
          <View style={styles.criteria}>
            {selectedTask.criteria.map((criterion) => (
              <View key={criterion.id} style={styles.criterion}>
                <Text style={styles.bullet}>✓</Text>
                <Text style={styles.criterionText}>{criterion.description}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.meta}>
            {criteriaDone} required checks · task {selectedTask.id}
          </Text>
          <Text style={styles.meta}>
            {selectedTask.chain?.taskPda
              ? `Selected PDA ${shortAddress(selectedTask.chain.taskPda)}`
              : "Not yet executable on-chain"}
          </Text>
          <Text style={styles.meta}>
            {authoritative
              ? `Authoritative devnet state · worker ${
                  displayWorker ? shortAddress(displayWorker) : "unassigned"
                }`
              : "Actions locked until authoritative devnet reconciliation succeeds"}
          </Text>

          <Pressable
            style={styles.secondaryAction}
            onPress={() => setSelectedView("history")}
          >
            <Text style={styles.secondaryActionText}>View receipt history</Text>
          </Pressable>

          {claimSignature ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>CLAIM RECEIPT · DEVNET</Text>
              <Text selectable style={styles.receiptText}>
                {claimSignature}
              </Text>
            </View>
          ) : null}

          {displayStatus === "open" ? (
            <Pressable
              style={[
                styles.primaryButton,
                (!eligibility.canClaim || busy) && styles.disabled,
              ]}
              disabled={!eligibility.canClaim || busy}
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

          {displayStatus === "claimed" ? (
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
                style={[
                  styles.secondaryAction,
                  (!eligibility.canCapture || busy) && styles.disabled,
                ]}
                disabled={!eligibility.canCapture || busy}
                onPress={captureEvidence}
              >
                <Text style={styles.secondaryActionText}>
                  {capturedEvidence
                    ? "Retake evidence photo"
                    : "Capture evidence photo"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.primaryButton,
                  (!eligibility.canSubmit || busy) && styles.disabled,
                ]}
                disabled={!eligibility.canSubmit || busy}
                onPress={submitEvidence}
              >
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Submit evidence to selected Anchor task
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}

          {displayStatus === "delivered" && authoritative?.evidenceHash ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>ANCHOR DELIVERY · DEVNET</Text>
              <Text style={styles.receiptText}>
                evidence {shortHash(authoritative.evidenceHash)}
              </Text>
              {deliverySignature ? (
                <Text selectable style={styles.receiptText}>
                  {deliverySignature}
                </Text>
              ) : null}
            </View>
          ) : null}

          {displayStatus === "accepted" ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>DELIVERY ACCEPTED · DEVNET</Text>
              <Text style={styles.receiptText}>
                Generic payout remains locked until vault and worker-token account
                derivation is independently verified.
              </Text>
              <Pressable
                style={[styles.primaryButton, styles.disabled]}
                disabled
              >
                <Text style={styles.primaryButtonText}>
                  Payout verification pending
                </Text>
              </Pressable>
            </View>
          ) : null}

          {displayStatus === "paid" ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>ESCROW PAID · DEVNET</Text>
              <Text style={styles.receiptText}>
                Solana reports this selected task as paid.
              </Text>
              {payoutSignature ? (
                <Text selectable style={styles.receiptText}>
                  {payoutSignature}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={styles.resetButton}
            onPress={() => void refreshSelectedTask()}
          >
            <Text style={styles.resetText}>Refresh selected on-chain task</Text>
          </Pressable>
        </View>

        {chainError ? (
          <Text style={styles.warning}>Devnet read: {chainError}</Text>
        ) : null}
        {gatewayError ? (
          <Text style={styles.warning}>Gateway: {gatewayError}</Text>
        ) : null}

        <Text style={styles.footer}>
          Restart restores only safe task context. Every state-changing action
          stays locked until this exact selected PDA is reconciled against Solana.
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
  backText: {
    color: "#aefbc7",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
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
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
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
  emptyCard: {
    backgroundColor: "#111713",
    borderColor: "#2a3f31",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  taskHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
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
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
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
    textAlign: "center",
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
  warning: {
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
