export function semanticError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parseDecisionMetadata(raw) {
  if (raw == null) return null;

  let value;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw semanticError('memory_metadata_invalid');
  }

  if (
    value === null || typeof value !== 'object' || Array.isArray(value) ||
    typeof value.rationale !== 'string' || value.rationale.length === 0 ||
    !Array.isArray(value.alternatives) ||
    value.alternatives.some((item) => typeof item !== 'string') ||
    (value.context !== undefined && typeof value.context !== 'string')
  ) {
    throw semanticError('memory_metadata_invalid');
  }

  const result = {
    rationale: value.rationale,
    alternatives: [...value.alternatives]
  };
  if (value.context !== undefined) result.context = value.context;
  return result;
}

export function wouldCreateCycle(edges, fromId, toId) {
  if (fromId === toId) return true;

  const successors = new Map();
  for (const edge of edges ?? []) {
    if (
      (edge?.type === 'revision' || edge?.type === 'supersede') &&
      typeof edge?.memoryId === 'string' &&
      typeof edge?.relatedMemoryId === 'string'
    ) {
      successors.set(edge.memoryId, edge.relatedMemoryId);
    }
  }

  const seen = new Set();
  let cursor = toId;
  while (typeof cursor === 'string' && !seen.has(cursor)) {
    if (cursor === fromId) return true;
    seen.add(cursor);
    cursor = successors.get(cursor);
  }
  return false;
}

export function deriveMemoryState({
  outgoing = [],
  incoming = [],
  confirmations = [],
  decisionEvent = null
} = {}) {
  const successor = outgoing.find((event) => event?.type === 'revision' || event?.type === 'supersede');
  const state = { current: !successor };

  if (successor) {
    state.supersededBy = successor.relatedMemoryId;
    state.supersessionType = successor.type;
  }

  if (incoming.length === 1) {
    const predecessor = incoming[0];
    if (predecessor?.type === 'revision') state.revisedFrom = predecessor.memoryId;
    if (predecessor?.type === 'supersede') state.supersededFrom = predecessor.memoryId;
  }

  if (confirmations.length > 0) {
    const timestamps = confirmations
      .map((event) => event?.createdAt)
      .filter((value) => typeof value === 'string')
      .sort();
    state.confirmationCount = confirmations.length;
    if (timestamps.length > 0) state.lastConfirmedAt = timestamps.at(-1);
  } else {
    state.confirmationCount = 0;
  }

  if (decisionEvent) {
    state.decision = parseDecisionMetadata(decisionEvent.metadataJson ?? decisionEvent.metadata_json ?? null);
  }

  return state;
}
