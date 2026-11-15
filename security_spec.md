# Security Specification — Meu Campus ALEPA 2026

## 1. Data Invariants & Role Separation
1. **Separated Roles (`student | teacher | editor | admin | dev`)**:
   - `student`: full access strictly inside `/users/{uid}` and own subcollections (`topicProgress`, `studySessions`, `simuladoAttempts`, `errorNotebook`, `disciplineGoals`, `readingProgress`, `mediaProgress`), read published catalog items (`exams`, `managedDisciplines`, `managedTopics`, `simuladoLists`, `platformNotices`, `classes` where active, `lessons` published, `activities` published, `materials` `isShared == true && status == 'published'`, `sharedQuestions` `isPublished == true && status == 'published'`), create/update own `submissions` and `enrollments`, and open/reply in own `academicRequests`.
   - `teacher`: strictly distinct from `editor` and `admin`. May manage `lessons`, `activities`, `enrollments`, and grade `submissions` ONLY within classes where `request.auth.uid in class.teacherIds` (stored on the document without unbounded arrays). May author `draft` or `in_review` `materials` (including structured chapters and study recommendations) and `sharedQuestions`, without privilege to publish institutional catalog items directly (`status == 'published' && isShared == true`), manage user roles, change storage configuration, or inspect `auditLogs`. May respond to assigned or discipline-scoped `academicRequests` without `senderRole` spoofing.
   - `editor` (Administrador de Conteúdo): may review, approve, and publish `materials`, `sharedQuestions`, `managedDisciplines`, `managedTopics`, `simuladoLists`, `platformNotices`, and `lessons`, without privilege to manage user roles/activation, storage provider policies, or delete audit logs.
   - `admin` / `dev` (Administrador Principal): full governance over users (`role`, `active`, `assignedClassIds`, `assignedDisciplineIds`), `exams`, `classes`, `storageMetadata`, `familyMembers`, `academicRequests` routing/reassignment, and `auditLogs` read access.
2. **Storage Rules Hardening**:
   - `/campus-materials/{uploaderUid}/**` rejects verified students via cross-service `firestore.get(...)` role check (`admin | dev | editor | teacher` with `active != false`) plus `isPrimaryAdminEmail()`, enforces verified reads, 100 MB cap, and strict MIME allowlist (`application/pdf`, `video/*`, `audio/*`, `image/*`, PPTX/XLSX).
   - `/user-uploads/{userId}/**` restricts access strictly to owner or primary admin within 50 MB and safe MIME types.
3. **Owner & Master Gate Discipline**:
   - Every `/users/{userId}` subcollection validates parent existence (`exists(/databases/$(database)/documents/users/$(userId))`), strict ownership (`isOwner(userId)`), bounded fields/arrays, and `updatedAt == request.time`.
   - User profile `preferences` (`theme`, `accentColor`, `fontScale`, `density`, `hiddenDashboardCards`, `dashboardCardOrder`, favorites, shortcuts, `preferredCampus`, `preferredMedioCargo`, `mediaPlaybackPreference`) are owner-editable via `affectedKeys().hasOnly(...)` without ever allowing edits to `role`, `active`, `assignedClassIds`, or `assignedDisciplineIds`.
4. **List & Field Hardening**:
   - Every `allow list` rule evaluates `resource.data` directly with zero cross-doc `get()`/`exists()` lookups on queried resources.
   - `isValidId(docId)` is enforced on `get`, `create`, `update`, and `delete` operations (never inside `allow list`).
   - All privileged/shared writes require `request.auth.token.email_verified == true`.
   - `auditLogs` and `/academicRequests/{requestId}/messages/{messageId}` are strictly append-only (`allow update, delete: if false`) and never store passwords, OAuth tokens, or API secrets.

## 2. Adversarial Test Matrix (Dirty Dozen + Multi-Role RBAC)
1. Unauthenticated read/write on `/users/u1` -> PERMISSION_DENIED.
2. Unverified email (`email_verified: false`) writing `/users/u1` or `/auditLogs` -> PERMISSION_DENIED.
3. Student spoofing `role: 'teacher'` or `role: 'editor'` on `/users/u1` create/update -> PERMISSION_DENIED.
4. Student injecting shadow field `isVerified: true` or modifying `active`/`assignedClassIds` -> PERMISSION_DENIED.
5. Student uploading into `/campus-materials/{studentUid}/...` in Cloud Storage -> PERMISSION_DENIED.
6. Teacher attempting to publish institutional `isShared: true, status: 'published'` on `/materials/m1` -> PERMISSION_DENIED.
7. Content Editor attempting to read `/auditLogs` or delete `/storageMetadata/f1` -> PERMISSION_DENIED.
8. User A reading/listing User B's `/users/u2/errorNotebook` or `/academicRequests` belonging to Student B -> PERMISSION_DENIED.
9. Student updating `manualScore`, `finalScore`, or `gradedBy` on own `/submissions/s1` or spoofing `senderRole: 'teacher'` in `/academicRequests/{id}/messages` -> PERMISSION_DENIED.
10. Client-forged `createdAt` or `updatedAt != request.time` on `/users/u1/studySessions/s1` or `/auditLogs/l1` -> PERMISSION_DENIED.
11. Mutating or deleting `/auditLogs/{logId}` or `/academicRequests/{id}/messages/{msgId}` -> PERMISSION_DENIED.
12. Blanket `list` query on `/materials`, `/submissions`, or `/academicRequests` without authorized filter -> PERMISSION_DENIED.
