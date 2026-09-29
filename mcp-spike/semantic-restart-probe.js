export const PROBE_IDS = Object.freeze({
  old: 'semantic-old-v01',
  current: 'semantic-new-v01',
  supersedeOld: 'semantic-super-old-v01',
  supersedeCurrent: 'semantic-super-new-v01',
  decision: 'semantic-decision-v01'
});

const SCOPE = 'spike:semantic-restart-proof';
const REVISION_QUERY = 'semantic-revision-v01';
const OLD_CONTENT = 'semantic-revision-v01 original';
const CURRENT_CONTENT = 'semantic-revision-v01 current';
const SUPER_OLD_CONTENT = 'semantic-supersede-v01 original';
const SUPER_CURRENT_CONTENT = 'semantic-supersede-v01 current';
const DECISION_TEXT = 'Keep append-only semantic history for restart proof';
const DECISION_METADATA = Object.freeze({
  rationale: 'Append-only events preserve audit history across process replacement.',
  alternatives: ['mutable overwrite', 'process-local memory'],
  context: 'synthetic semantic restart proof'
});

function isFound(result, id, content) {
  return Boolean(result?.found === true && result?.item?.id === id && result?.item?.content === content);
}

function sameDecisionMetadata(value) {
  return Boolean(
    value?.rationale === DECISION_METADATA.rationale &&
    Array.isArray(value?.alternatives) &&
    value.alternatives.length === DECISION_METADATA.alternatives.length &&
    value.alternatives.every((item, index) => item === DECISION_METADATA.alternatives[index]) &&
    value?.context === DECISION_METADATA.context
  );
}

export async function runSemanticRestartProbe(callTool) {
  const initial = {
    old: await callTool('memory_get', { id: PROBE_IDS.old }),
    current: await callTool('memory_get', { id: PROBE_IDS.current }),
    supersedeOld: await callTool('memory_get', { id: PROBE_IDS.supersedeOld }),
    supersedeCurrent: await callTool('memory_get', { id: PROBE_IDS.supersedeCurrent }),
    decision: await callTool('memory_get', { id: PROBE_IDS.decision })
  };

  const preexisting = (
    isFound(initial.old, PROBE_IDS.old, OLD_CONTENT) &&
    isFound(initial.current, PROBE_IDS.current, CURRENT_CONTENT) &&
    isFound(initial.supersedeOld, PROBE_IDS.supersedeOld, SUPER_OLD_CONTENT) &&
    isFound(initial.supersedeCurrent, PROBE_IDS.supersedeCurrent, SUPER_CURRENT_CONTENT) &&
    isFound(initial.decision, PROBE_IDS.decision, DECISION_TEXT)
  );

  let writes = 0;
  let old = initial.old;
  let current = initial.current;

  if (!old?.found) {
    await callTool('memory_create', { id: PROBE_IDS.old, scope: SCOPE, kind: 'test', content: OLD_CONTENT });
    writes += 1;
    old = await callTool('memory_get', { id: PROBE_IDS.old });
  }

  if (!current?.found) {
    if (old?.state?.current !== true) throw new Error('semantic_probe_revision_source_not_current');
    await callTool('memory_revise', {
      id: PROBE_IDS.old,
      newId: PROBE_IDS.current,
      content: CURRENT_CONTENT,
      reason: 'synthetic restart proof revision'
    });
    writes += 1;
    old = await callTool('memory_get', { id: PROBE_IDS.old });
    current = await callTool('memory_get', { id: PROBE_IDS.current });
  } else if (old?.state?.current === true) {
    throw new Error('semantic_probe_revision_relation_missing');
  }

  if ((current?.state?.confirmationCount ?? 0) === 0) {
    await callTool('memory_confirm', { id: PROBE_IDS.current, note: 'synthetic restart proof confirmation' });
    writes += 1;
    current = await callTool('memory_get', { id: PROBE_IDS.current });
  }

  let supersedeOld = initial.supersedeOld;
  let supersedeCurrent = initial.supersedeCurrent;

  if (!supersedeOld?.found) {
    await callTool('memory_create', { id: PROBE_IDS.supersedeOld, scope: SCOPE, kind: 'test', content: SUPER_OLD_CONTENT });
    writes += 1;
    supersedeOld = await callTool('memory_get', { id: PROBE_IDS.supersedeOld });
  }

  if (!supersedeCurrent?.found) {
    await callTool('memory_create', { id: PROBE_IDS.supersedeCurrent, scope: SCOPE, kind: 'test', content: SUPER_CURRENT_CONTENT });
    writes += 1;
    supersedeCurrent = await callTool('memory_get', { id: PROBE_IDS.supersedeCurrent });
  }

  if (supersedeOld?.state?.current === true) {
    if (supersedeCurrent?.state?.current !== true) throw new Error('semantic_probe_supersede_target_not_current');
    await callTool('memory_supersede', {
      oldId: PROBE_IDS.supersedeOld,
      newId: PROBE_IDS.supersedeCurrent,
      reason: 'synthetic restart proof supersession'
    });
    writes += 1;
    supersedeOld = await callTool('memory_get', { id: PROBE_IDS.supersedeOld });
    supersedeCurrent = await callTool('memory_get', { id: PROBE_IDS.supersedeCurrent });
  }

  let decision = initial.decision;
  if (!decision?.found) {
    await callTool('decision_record', {
      id: PROBE_IDS.decision,
      scope: SCOPE,
      decision: DECISION_TEXT,
      rationale: DECISION_METADATA.rationale,
      alternatives: [...DECISION_METADATA.alternatives],
      context: DECISION_METADATA.context
    });
    writes += 1;
    decision = await callTool('memory_get', { id: PROBE_IDS.decision });
  }

  const finalOld = await callTool('memory_get', { id: PROBE_IDS.old });
  const finalCurrent = await callTool('memory_get', { id: PROBE_IDS.current });
  const finalSupersedeOld = await callTool('memory_get', { id: PROBE_IDS.supersedeOld });
  const finalSupersedeCurrent = await callTool('memory_get', { id: PROBE_IDS.supersedeCurrent });
  const finalDecision = await callTool('memory_get', { id: PROBE_IDS.decision });
  const currentSearchResult = await callTool('memory_search', { query: REVISION_QUERY, limit: 5, includeHistory: false });
  const historySearchResult = await callTool('memory_search', { query: REVISION_QUERY, limit: 5, includeHistory: true });

  const revision = Boolean(
    isFound(finalOld, PROBE_IDS.old, OLD_CONTENT) &&
    finalOld?.state?.current === false &&
    finalOld?.state?.supersededBy === PROBE_IDS.current &&
    finalOld?.state?.supersessionType === 'revision' &&
    isFound(finalCurrent, PROBE_IDS.current, CURRENT_CONTENT) &&
    finalCurrent?.state?.current === true &&
    finalCurrent?.state?.revisedFrom === PROBE_IDS.old
  );

  const confirmation = Boolean((finalCurrent?.state?.confirmationCount ?? 0) >= 1);
  const supersession = Boolean(
    isFound(finalSupersedeOld, PROBE_IDS.supersedeOld, SUPER_OLD_CONTENT) &&
    finalSupersedeOld?.state?.current === false &&
    finalSupersedeOld?.state?.supersededBy === PROBE_IDS.supersedeCurrent &&
    finalSupersedeOld?.state?.supersessionType === 'supersede' &&
    isFound(finalSupersedeCurrent, PROBE_IDS.supersedeCurrent, SUPER_CURRENT_CONTENT) &&
    finalSupersedeCurrent?.state?.current === true &&
    finalSupersedeCurrent?.state?.supersededFrom === PROBE_IDS.supersedeOld
  );
  const decisionOk = Boolean(
    isFound(finalDecision, PROBE_IDS.decision, DECISION_TEXT) &&
    finalDecision?.item?.kind === 'decision' &&
    sameDecisionMetadata(finalDecision?.state?.decision)
  );

  const currentIds = currentSearchResult?.items?.map((item) => item.id) ?? [];
  const historyIds = historySearchResult?.items?.map((item) => item.id) ?? [];
  const currentSearch = currentIds.length === 1 && currentIds[0] === PROBE_IDS.current;
  const historySearch = historyIds.includes(PROBE_IDS.old) && historyIds.includes(PROBE_IDS.current);

  return {
    ok: revision && confirmation && supersession && decisionOk && currentSearch && historySearch,
    preexisting,
    seeded: writes > 0,
    revision,
    confirmation,
    supersession,
    decision: decisionOk,
    currentSearch,
    historySearch,
    ids: PROBE_IDS
  };
}
