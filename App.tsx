import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  createSolanaDevnet,
  MobileWalletProvider,
  useMobileWallet,
} from "@wallet-ui/react-native-kit";

import { demoTask } from "./src/demo/task";
import { transition } from "./src/protocol/state-machine";
import type { RelayTask } from "./src/protocol/types";

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

function RelayScreen() {
  const { account, connect, disconnect, sendTransactions } = useMobileWallet();
  const [task, setTask] = useState<RelayTask>(demoTask);
  const [signature, setSignature] = useState<string>();
  const [busy, setBusy] = useState(false);

  const walletAddress = account?.address?.toString();
  const canClaim = task.status === "open" && Boolean(walletAddress);

  const criteriaDone = useMemo(
    () => task.criteria.filter((criterion) => criterion.required).length,
    [task.criteria],
  );

  async function claimTask() {
    if (!walletAddress || !canClaim) return;

    setBusy(true);
    try {
      const memo = JSON.stringify({
        app: "ground-relay",
        v: 1,
        action: "claim",
        taskId: task.id,
      });

      const nextSignature = await sendTransactions([
        getAddMemoInstruction({ memo }),
      ]);

      setSignature(nextSignature.toString());
      setTask((current) => ({
        ...current,
        worker: walletAddress,
        status: transition(current.status, "claimed"),
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wallet transaction failed";
      Alert.alert("Claim failed", message);
    } finally {
      setBusy(false);
    }
  }

  function resetDemo() {
    setTask(demoTask);
    setSignature(undefined);
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
            onPress={walletAddress ? disconnect : connect}
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
            <Text style={styles.reward}>1.00 USDC</Text>
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

          {signature ? (
            <View style={styles.receipt}>
              <Text style={styles.label}>DEVNET CLAIM RECEIPT</Text>
              <Text selectable style={styles.receiptText}>
                {signature}
              </Text>
            </View>
          ) : null}

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
                {task.status === "open"
                  ? walletAddress
                    ? "Claim on Solana devnet"
                    : "Connect wallet to claim"
                  : "Task claimed"}
              </Text>
            )}
          </Pressable>

          {task.status !== "open" ? (
            <Pressable style={styles.resetButton} onPress={resetDemo}>
              <Text style={styles.resetText}>Reset demo task</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.footer}>
          Next: evidence capture → verification → escrow payout → agent resume
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
  footer: {
    color: "#67746c",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
    paddingBottom: 24,
  },
});
