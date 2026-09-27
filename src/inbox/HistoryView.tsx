import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { buildTaskHistory, type TaskHistoryState } from "./history";
import type { ReconciledTaskState } from "./reconcile";
import type { InboxTaskSummary, SelectedTaskSession } from "./types";

function shortAddress(value: string): string {
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function stateLabel(state: TaskHistoryState): string {
  if (state === "solana_confirmed") return "SOLANA CONFIRMED";
  if (state === "receipt_only") return "RECEIPT ONLY";
  return "CACHED OBSERVATION";
}

export function HistoryView({
  summary,
  session,
  authoritative,
  chainError,
  onBack,
  onRefresh,
}: {
  summary: InboxTaskSummary;
  session?: SelectedTaskSession;
  authoritative?: ReconciledTaskState;
  chainError?: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const history = buildTaskHistory({ summary, session, authoritative });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Task details</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>RECEIPTS · DEVNET</Text>
          <Text style={styles.title}>Receipt history</Text>
          <Text style={styles.subtitle}>{summary.title}</Text>
          <Text style={styles.meta}>
            {summary.chain?.taskPda
              ? `Selected PDA ${shortAddress(summary.chain.taskPda)}`
              : "Task is not bound to Solana"}
          </Text>
        </View>

        <View style={styles.authorityCard}>
          <Text style={styles.authorityTitle}>
            {authoritative ? "Authoritative Solana state loaded" : "Read-only restored history"}
          </Text>
          <Text style={styles.body}>
            {authoritative
              ? "Stages marked Solana confirmed come from the exact reconciled selected PDA."
              : "Cached observations and restored receipts are context only; they are not proof of on-chain progression."}
          </Text>
        </View>

        {history.map((entry) => (
          <View key={entry.stage} style={styles.entry}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryTitle}>{entry.title}</Text>
              <Text style={styles.entryState}>{stateLabel(entry.state)}</Text>
            </View>
            {entry.receipts.length === 0 ? (
              <Text style={styles.meta}>No stored receipt for this stage.</Text>
            ) : (
              entry.receipts.map((receipt) => (
                <View key={`${entry.stage}:${receipt.label}:${receipt.value}`} style={styles.receipt}>
                  <Text style={styles.receiptLabel}>
                    {receipt.label} · {receipt.source.toUpperCase()}
                  </Text>
                  <Text selectable style={styles.receiptValue}>{receipt.value}</Text>
                </View>
              ))
            )}
          </View>
        ))}

        <Pressable style={styles.refresh} onPress={onRefresh}>
          <Text style={styles.refreshText}>Refresh selected task from Solana</Text>
        </Pressable>

        {chainError ? <Text style={styles.warning}>Devnet read: {chainError}</Text> : null}

        <Text style={styles.footer}>
          Receipt history never upgrades cached or local data into protocol authority. Solana reconciliation is the source of truth.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070a08" },
  content: { padding: 20, gap: 16 },
  back: { color: "#aefbc7", fontSize: 13, fontWeight: "700", paddingTop: 12 },
  hero: { gap: 6 },
  eyebrow: { color: "#78f7a4", fontSize: 12, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#ffffff", fontSize: 32, fontWeight: "800" },
  subtitle: { color: "#dfe8e1", fontSize: 17, fontWeight: "700" },
  meta: { color: "#748078", fontSize: 12, lineHeight: 17 },
  authorityCard: { backgroundColor: "#101713", borderColor: "#26372d", borderRadius: 16, borderWidth: 1, gap: 7, padding: 15 },
  authorityTitle: { color: "#dff8e7", fontSize: 14, fontWeight: "800" },
  body: { color: "#aab7ae", fontSize: 13, lineHeight: 19 },
  entry: { backgroundColor: "#111713", borderColor: "#2a3f31", borderRadius: 16, borderWidth: 1, gap: 10, padding: 15 },
  entryHeader: { gap: 5 },
  entryTitle: { color: "#ffffff", fontSize: 17, fontWeight: "800" },
  entryState: { color: "#79f19f", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  receipt: { backgroundColor: "#08110b", borderRadius: 10, gap: 6, padding: 11 },
  receiptLabel: { color: "#789184", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  receiptValue: { color: "#9bd8ac", fontFamily: "monospace", fontSize: 10, lineHeight: 15 },
  refresh: { alignItems: "center", borderColor: "#4f6d59", borderRadius: 14, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  refreshText: { color: "#baf9ce", fontSize: 14, fontWeight: "800" },
  warning: { color: "#d6a96f", fontSize: 11, lineHeight: 17 },
  footer: { color: "#67746c", fontSize: 12, lineHeight: 18, paddingBottom: 24 },
});
