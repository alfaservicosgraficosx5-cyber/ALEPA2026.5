export type UserRole = 'student' | 'editor' | 'admin' | 'dev' | 'teacher';
export type NormalizedUserRole = 'student' | 'editor' | 'admin' | 'dev';
export type PublicationStatus = 'draft' | 'published' | 'archived';

export function normalizeUserRole(
  role?: string | null,
  isPrimaryAdmin = false
): NormalizedUserRole {
  if (isPrimaryAdmin) {
    return role === 'dev' ? 'dev' : 'admin';
  }
  if (role === 'admin' || role === 'dev' || role === 'editor' || role === 'student') {
    return role;
  }
  if (role === 'teacher') {
    return 'editor';
  }
  return 'student';
}

export function isStaffRole(role?: string | null, isPrimaryAdmin = false): boolean {
  const normalized = normalizeUserRole(role, isPrimaryAdmin);
  return normalized === 'admin' || normalized === 'editor' || normalized === 'dev';
}

export function canManageUsersRole(role?: string | null, isPrimaryAdmin = false): boolean {
  const normalized = normalizeUserRole(role, isPrimaryAdmin);
  return normalized === 'admin' || normalized === 'dev';
}

export function formatRoleLabel(role?: string | null, isPrimaryAdmin = false): string {
  const normalized = normalizeUserRole(role, isPrimaryAdmin);
  switch (normalized) {
    case 'admin':
      return 'Administrador';
    case 'editor':
      return 'Editor / Professor';
    case 'dev':
      return 'Desenvolvedor';
    default:
      return 'Estudante';
  }
}

export type CampusLevel = 'medio' | 'superior';
export type LibraryScope = 'geral' | 'superior' | 'medio';
export type MedioCargoGroup = 'cargo_01_04' | 'cargo_01' | 'cargo_02' | 'cargo_03';

export type NavSection =
  | 'dashboard'
  | 'preparation'
  | 'disciplines'
  | 'study_room'
  | 'schedule'
  | 'simulados'
  | 'revisions'
  | 'podcasts'
  | 'videos'
  | 'gemini'
  | 'materials'
  | 'performance'
  | 'family'
  | 'settings'
  | 'admin';

export type BlockType = 'theory' | 'questions' | 'correction' | 'revision';

export type MaterialFileType = 'pdf' | 'pptx' | 'xlsx' | 'drive' | 'video';

export type MaterialRelevanceTier = 'essencial' | 'complementar' | 'aprofundamento';

export type ResourceType =
  | 'pdf'
  | 'livro_digital'
  | 'video'
  | 'podcast'
  | 'legislacao'
  | 'curso'
  | 'questoes'
  | 'simulado';

export type SuperiorLibraryCategoryId =
  | 'cat_01_portugues'
  | 'cat_02_legislacao_etica'
  | 'cat_03_informatica'
  | 'cat_04_raciocinio_logico'
  | 'cat_05_constitucional_adm'
  | 'cat_06_processo_legislativo'
  | 'cat_07_administracao_geral'
  | 'cat_08_secretaria_redacao'
  | 'cat_09_arquivologia'
  | 'cat_10_recursos_materiais';

export type MedioLibraryCategoryId =
  | 'nm_cat_01_portugues'
  | 'nm_cat_02_legislacao_etica'
  | 'nm_cat_03_informatica'
  | 'nm_cat_04_raciocinio_logico'
  | 'nm_cat_05_constitucional'
  | 'nm_cat_06_administrativo'
  | 'nm_cat_07_tecnica_legislativa'
  | 'nm_cat_08_administracao_publica'
  | 'nm_cat_09_secretaria'
  | 'nm_cat_10_arquivologia'
  | 'nm_cat_11_recursos_materiais';

export type GeralLibraryCategoryId =
  | 'geral_cat_01_portugues'
  | 'geral_cat_02_raciocinio_logico'
  | 'geral_cat_03_informatica'
  | 'geral_cat_04_constitucional'
  | 'geral_cat_05_administrativo'
  | 'geral_cat_06_legislacao_alepa'
  | 'geral_cat_07_etica'
  | 'geral_cat_08_tecnica_legislativa';

export type LibraryCategoryId =
  | SuperiorLibraryCategoryId
  | MedioLibraryCategoryId
  | GeralLibraryCategoryId;

export type LinkStatus = 'ativo' | 'instavel' | 'atualizacao';

export type QuestionOriginType =
  | 'official_cetap'
  | 'official_camara'
  | 'official_alepa'
  | 'training_platform'
  | 'ai_generated';

export type QuestionDifficulty = 'basico' | 'intermediario' | 'avancado';

export type ErrorReason = 'atencao' | 'teoria' | 'lei_seca' | 'banca_cetap';

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  role: UserRole;
  dailyGoalMinutes: number;
  examDate: string;
  targetCargo: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SyllabusTopic {
  id: string;
  disciplineId: string;
  title: string;
  subtopics: string[];
  highYield: boolean;
}

export interface Discipline {
  id: string;
  name: string;
  shortName: string;
  editalBlock:
    | 'Conhecimentos Específicos'
    | 'Legislação e Ética'
    | 'Língua Portuguesa'
    | 'Raciocínio Lógico'
    | 'Noções de Informática';
  priorityRank: number;
  examQuestions: number;
  examPoints: number;
  tieBreakerOrder: number;
  recommendedMinutesPerCycle: number;
  topics: SyllabusTopic[];
}

export interface LibraryCategory {
  id: LibraryCategoryId;
  order: number;
  title: string;
  description: string;
  disciplineId: string;
}

export interface TopicProgress {
  topicId: string;
  userId: string;
  disciplineId: string;
  theoryDone: boolean;
  questionsDone: boolean;
  revisionDone: boolean;
  masteryLevel: number;
  notes?: string;
  updatedAt?: unknown;
}

export interface DisciplineWeeklyGoal {
  disciplineId: string;
  userId: string;
  weeklyGoalMinutes: number;
  updatedAt?: unknown;
}

export interface StudySession {
  id: string;
  userId: string;
  dateKey: string;
  disciplineId: string;
  topicTitle: string;
  blockType: BlockType;
  durationMinutes: number;
  notes?: string;
  createdAt?: unknown;
}

export interface Question {
  id: string;
  disciplineId: string;
  topicTitle: string;
  statement: string;
  options: [string, string, string, string, string];
  correctIndex: number;
  explanation: string;
  legalBasis?: string;
  source?: string;
  originType?: QuestionOriginType;
  isOfficial?: boolean;
  difficulty?: QuestionDifficulty;
  year?: number;
  cargo?: string;
  escolaridade?: CampusLevel;
  authorId?: string;
  isPublished?: boolean;
  status?: PublicationStatus;
  updatedAt?: unknown;
}

export interface SimuladoAttempt {
  id: string;
  userId: string;
  title: string;
  mode: 'treino' | 'simulado';
  primaryDisciplineId: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  durationSeconds: number;
  createdAt?: unknown;
}

export interface ErrorEntry {
  id: string;
  userId: string;
  questionId: string;
  disciplineId: string;
  topicTitle: string;
  questionStem: string;
  correctOption: string;
  selectedOption: string;
  errorReason: ErrorReason;
  improvementNote: string;
  nextReviewDate: string;
  reviewCount: number;
  status: 'pending' | 'mastered';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyMaterial {
  id: string;
  ownerId: string;
  title: string;
  disciplineId: string;
  libraryCategoryId?: LibraryCategoryId;
  editalTopic?: string;
  resourceType?: ResourceType;
  fileType: MaterialFileType;
  institution?: string;
  url: string;
  pricing?: 'gratuito' | 'pago';
  publishedAt?: string;
  lastVerifiedAt?: string;
  linkStatus?: LinkStatus;
  isOfficialContent?: boolean;
  relevanceTier?: MaterialRelevanceTier;
  campusLevel?: LibraryScope;
  status?: PublicationStatus;
  updatedBy?: string;
  fileName?: string;
  description?: string;
  isShared: boolean;
  isSystemDefault?: boolean;
  localBlobKey?: string;
  allowDownload?: boolean;
  textLayerStatus?: 'selectable' | 'scanned' | 'mixed' | 'unknown';
  pageCount?: number;
  fileSizeBytes?: number;
  version?: number;
  versionNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FamilyMember {
  id: string;
  memberId: string;
  name: string;
  email: string;
  relationship: string;
  canPublish: boolean;
  active: boolean;
  invitedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AccessSession {
  id: string;
  userId: string;
  deviceId: string;
  displayName: string;
  accessType: 'admin' | 'familiar' | 'estudante';
  deviceType: 'mobile' | 'desktop';
  currentTab: string;
  activeCampus: CampusLevel;
  isOnline: boolean;
  sessionStartedAt?: unknown;
  lastSeenAt?: unknown;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  tip?: string;
}

export interface MindMapBranch {
  title: string;
  items: string[];
}

export interface MindMapData {
  centralTopic: string;
  branches: MindMapBranch[];
}

export interface LastStudiedContext {
  campus: CampusLevel;
  section: NavSection;
  disciplineId?: string;
  topicId?: string;
  topicTitle?: string;
  label: string;
  updatedAt: string;
}

export interface SpacedRepetitionConfig {
  preset: 'padrao' | 'intensivo' | 'estendido';
  intervals: [number, number, number, number];
}

export interface ManagedDiscipline {
  id: string;
  name: string;
  shortName: string;
  campusLevel: CampusLevel;
  editalBlock: Discipline['editalBlock'];
  priorityRank: number;
  examQuestions: number;
  examPoints: number;
  tieBreakerOrder: number;
  recommendedMinutesPerCycle: number;
  status: PublicationStatus;
  authorId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ManagedTopic {
  id: string;
  topicId: string;
  disciplineId: string;
  campusLevel: CampusLevel;
  title: string;
  subtopics: string[];
  highYield: boolean;
  order: number;
  status: PublicationStatus;
  authorId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SimuladoList {
  id: string;
  listId: string;
  title: string;
  description?: string;
  campusLevel: LibraryScope;
  durationMinutes: number;
  questionIds: string[];
  status: PublicationStatus;
  authorId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlatformNotice {
  id: string;
  noticeId: string;
  title: string;
  body: string;
  campusLevel: LibraryScope;
  priority: 'normal' | 'importante' | 'urgente';
  eventDate?: string;
  status: PublicationStatus;
  authorId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type BookReaderMode = 'book' | 'reading' | 'original';
export type BookReaderTheme = 'paper' | 'sepia' | 'night';
export type HighlightColor = 'amber' | 'emerald' | 'sky' | 'rose';

export interface ReaderBookmark {
  id: string;
  page: number;
  label: string;
  createdAt: string;
}

export interface ReaderHighlight {
  id: string;
  page: number;
  quote: string;
  color: HighlightColor;
  note?: string;
  createdAt: string;
}

export interface ReaderAnnotation {
  id: string;
  page: number;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingProgress {
  materialId: string;
  userId: string;
  materialTitle: string;
  lastPage: number;
  totalPages: number;
  progressPercent: number;
  readingMode: BookReaderMode;
  fontSize: number;
  lineHeight: number;
  maxWidthCh: number;
  theme: BookReaderTheme;
  bookmarks: ReaderBookmark[];
  highlights: ReaderHighlight[];
  annotations: ReaderAnnotation[];
  lastReadAt: string;
  updatedAt?: unknown;
}

