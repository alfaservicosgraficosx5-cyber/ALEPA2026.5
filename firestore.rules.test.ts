/**
 * Security Rules Verification Suite (Dirty Dozen + Multi-Role RBAC Matrix)
 * Used to document and verify adversarial payloads against firestore.rules.
 */
export const dirtyDozenPayloads = [
  { id: 1, name: 'Unauthenticated user profile write', path: '/users/u1', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified email write', path: '/users/u1', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Self-assigned teacher/editor role spoofing', path: '/users/u1', payload: { role: 'teacher' }, expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow field or assignedClassIds injection on profile', path: '/users/u1', payload: { assignedClassIds: ['c1'] }, expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Teacher attempting institutional publish on shared material', path: '/materials/m1', payload: { isShared: true, status: 'published' }, expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Content editor reading admin auditLogs', path: '/auditLogs', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Cross-user errorNotebook or submission read', path: '/users/u2/errorNotebook', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Student self-grading own submission manualScore/finalScore', path: '/submissions/sub1', payload: { finalScore: 10 }, expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Client-forged createdAt timestamp', path: '/users/u1/studySessions/s1', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Audit log update or deletion attempt', path: '/auditLogs/log1', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Invalid path ID injection', path: '/users/u1/topicProgress/bad..id', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Blanket list query without owner/shared/teacher filter', path: '/materials', expected: 'PERMISSION_DENIED' },
] as const;
