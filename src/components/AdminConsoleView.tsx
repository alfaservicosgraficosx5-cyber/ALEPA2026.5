import React, { useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  Headphones,
  Layers,
  Laptop,
  Loader2,
  Lock,
  Plus,
  ScanSearch,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALEPA_DISCIPLINES } from '../data/alepaSyllabus';
import { getMedioDisciplines } from '../data/alepaMedioSyllabus';
import {
  CampusLevel,
  Discipline,
  LibraryScope,
  ManagedDiscipline,
  ManagedTopic,
  MaterialFileType,
  MaterialRelevanceTier,
  MedioCargoGroup,
  NavSection,
  NormalizedUserRole,
  PlatformNotice,
  PublicationStatus,
  Question,
  QuestionOriginType,
  ResourceType,
  SimuladoList,
  StudyMaterial,
  formatRoleLabel,
  normalizeUserRole,
} from '../types';
import { PageHeader, SectionCard, StatTile } from './ui/CampusPrimitives';
import { formatSafePublicUrl, getVideoEmbedInfo } from '../utils/mediaUrls';
import { inspectPdfMetadata, isPdfReadableMaterial, PdfInspectionResult } from '../lib/pdfBookEngine';
import { saveLocalFile } from '../lib/localFiles';
import { BookReaderModal } from './BookReaderModal';

type AdminSubTab = 'estatisticas' | 'edital' | 'materiais' | 'questoes' | 'avisos' | 'usuarios';

interface AdminConsoleViewProps {
  campus: CampusLevel;
  onChangeCampus: (campus: CampusLevel) => void;
  medioCargoGroup: MedioCargoGroup;
  onOpenStudentPreview?: (section: NavSection) => void;
}

const STATUS_BADGE: Record<PublicationStatus, { label: string; cls: string }> = {
  draft: {
    label: 'Rascunho',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  published: {
    label: 'Publicado',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  archived: {
    label: 'Arquivado',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export function AdminConsoleView({
  campus,
  onChangeCampus,
  medioCargoGroup,
  onOpenStudentPreview,
}: AdminConsoleViewProps) {
  const {
    user,
    effectiveRole,
    canAccessAdminPanel,
    canManageUsers,
    getIdToken,
    workspaceAccessToken,
    setActiveWorkspaceMode,
    allUsers,
    accessSessions,
    allManagedMaterials,
    allManagedQuestions,
    questions,
    allManagedDisciplines,
    allManagedTopics,
    allManagedSimuladoLists,
    allManagedNotices,
    getCampusDisciplines,
    addMaterial,
    updateMaterial,
    updateMaterialStatus,
    addCustomQuestion,
    updateCustomQuestion,
    updateQuestionStatus,
    saveManagedDiscipline,
    updateManagedDisciplineStatus,
    saveManagedTopic,
    updateManagedTopicStatus,
    saveSimuladoList,
    updateSimuladoListStatus,
    savePlatformNotice,
    updatePlatformNoticeStatus,
    updateUserRole,
  } = useAuth();

  const [subTab, setSubTab] = useState<AdminSubTab>('estatisticas');
  const [statusFilter, setStatusFilter] = useState<'all' | PublicationStatus>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [backendCheckMsg, setBackendCheckMsg] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<
    | { kind: 'material'; item: Partial<StudyMaterial> }
    | { kind: 'question'; item: Partial<Question> }
    | { kind: 'notice'; item: Partial<PlatformNotice> }
    | { kind: 'topic'; item: Partial<ManagedTopic>; disciplineName: string }
    | null
  >(null);

  // Discipline form state
  const [editingDiscId, setEditingDiscId] = useState<string | undefined>(undefined);
  const [discName, setDiscName] = useState('');
  const [discShortName, setDiscShortName] = useState('');
  const [discCampus, setDiscCampus] = useState<CampusLevel>(campus);
  const [discBlock, setDiscBlock] = useState<Discipline['editalBlock']>('Conhecimentos Específicos');
  const [discPriority, setDiscPriority] = useState(1);
  const [discQuestions, setDiscQuestions] = useState(10);
  const [discPoints, setDiscPoints] = useState(20);
  const [discMinutes, setDiscMinutes] = useState(60);

  // Topic form state
  const [editingTopicId, setEditingTopicId] = useState<string | undefined>(undefined);
  const [topicCampus, setTopicCampus] = useState<CampusLevel>(campus);
  const [topicDisciplineId, setTopicDisciplineId] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicSubtopicsText, setTopicSubtopicsText] = useState('');
  const [topicHighYield, setTopicHighYield] = useState(true);
  const [topicOrder, setTopicOrder] = useState(1);

  // Material form state
  const [editingMatId, setEditingMatId] = useState<string | undefined>(undefined);
  const [matTitle, setMatTitle] = useState('');
  const [matCampusLevel, setMatCampusLevel] = useState<LibraryScope>('superior');
  const [matDisciplineId, setMatDisciplineId] = useState('');
  const [matResourceType, setMatResourceType] = useState<ResourceType>('pdf');
  const [matFileType, setMatFileType] = useState<MaterialFileType>('pdf');
  const [matUrl, setMatUrl] = useState('');
  const [matInstitution, setMatInstitution] = useState('ALEPA / Curadoria Docente');
  const [matEditalTopic, setMatEditalTopic] = useState('');
  const [matRelevance, setMatRelevance] = useState<MaterialRelevanceTier>('essencial');
  const [matDescription, setMatDescription] = useState('');
  const [matAllowDownload, setMatAllowDownload] = useState(true);
  const [matTextLayerStatus, setMatTextLayerStatus] = useState<
    'selectable' | 'scanned' | 'mixed' | 'unknown'
  >('unknown');
  const [matPageCount, setMatPageCount] = useState<number | undefined>(undefined);
  const [matFileSizeBytes, setMatFileSizeBytes] = useState<number | undefined>(undefined);
  const [matVersion, setMatVersion] = useState<number>(1);
  const [matVersionNote, setMatVersionNote] = useState('');
  const [matOriginalUrl, setMatOriginalUrl] = useState('');
  const [matSelectedFile, setMatSelectedFile] = useState<File | null>(null);
  const [matInspecting, setMatInspecting] = useState(false);
  const [matInspectResult, setMatInspectResult] = useState<PdfInspectionResult | null>(null);
  const [adminReaderPreview, setAdminReaderPreview] = useState<StudyMaterial | null>(null);

  // Question form state
  const [editingQId, setEditingQId] = useState<string | undefined>(undefined);
  const [qCampus, setQCampus] = useState<CampusLevel>(campus);
  const [qDisciplineId, setQDisciplineId] = useState('');
  const [qTopicTitle, setQTopicTitle] = useState('');
  const [qOriginType, setQOriginType] = useState<QuestionOriginType>('training_platform');
  const [qSource, setQSource] = useState('Equipe Pedagógica ALEPA 2026');
  const [qStatement, setQStatement] = useState('');
  const [qOptions, setQOptions] = useState<[string, string, string, string, string]>(['', '', '', '', '']);
  const [qCorrectIndex, setQCorrectIndex] = useState(0);
  const [qExplanation, setQExplanation] = useState('');
  const [qLegalBasis, setQLegalBasis] = useState('');

  // Simulado List form state
  const [editingSimId, setEditingSimId] = useState<string | undefined>(undefined);
  const [simTitle, setSimTitle] = useState('');
  const [simDesc, setSimDesc] = useState('');
  const [simCampus, setSimCampus] = useState<LibraryScope>('superior');
  const [simDuration, setSimDuration] = useState(60);
  const [simQuestionIds, setSimQuestionIds] = useState<string[]>([]);

  // Notice form state
  const [editingNoticeId, setEditingNoticeId] = useState<string | undefined>(undefined);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeCampus, setNoticeCampus] = useState<LibraryScope>('geral');
  const [noticePriority, setNoticePriority] = useState<'normal' | 'importante' | 'urgente'>('importante');
  const [noticeDate, setNoticeDate] = useState('');

  // Users search
  const [userSearch, setUserSearch] = useState('');

  const allAvailableDisciplines = useMemo(() => {
    const sup = getCampusDisciplines('superior');
    const med = getCampusDisciplines('medio', medioCargoGroup);
    const map = new Map<string, Discipline & { campusTag: CampusLevel }>();
    sup.forEach((d) => map.set(d.id, { ...d, campusTag: 'superior' }));
    med.forEach((d) => map.set(d.id, { ...d, campusTag: 'medio' }));
    return Array.from(map.values());
  }, [getCampusDisciplines, medioCargoGroup]);

  const effectiveDiscForTopic =
    topicDisciplineId || (topicCampus === 'medio' ? getMedioDisciplines(medioCargoGroup)[0]?.id : ALEPA_DISCIPLINES[0]?.id) || '';
  const effectiveDiscForMat =
    matDisciplineId || (matCampusLevel === 'medio' ? getMedioDisciplines(medioCargoGroup)[0]?.id : ALEPA_DISCIPLINES[0]?.id) || '';
  const effectiveDiscForQ =
    qDisciplineId || (qCampus === 'medio' ? getMedioDisciplines(medioCargoGroup)[0]?.id : ALEPA_DISCIPLINES[0]?.id) || '';

  const stats = useMemo(() => {
    const customMats = allManagedMaterials.filter((m) => !m.isSystemDefault);
    const matDrafts = customMats.filter((m) => m.status === 'draft').length;
    const matPub = customMats.filter((m) => !m.status || m.status === 'published').length;
    const matArch = customMats.filter((m) => m.status === 'archived').length;

    const qDrafts = allManagedQuestions.filter((q) => q.status === 'draft').length;
    const qPub = allManagedQuestions.filter((q) => !q.status || q.status === 'published').length;
    const qArch = allManagedQuestions.filter((q) => q.status === 'archived').length;

    const onlineDevices = accessSessions.filter((s) => s.isOnline).length;
    const adminCount = allUsers.filter((u) => {
      const r = normalizeUserRole(u.role);
      return r === 'admin' || r === 'dev';
    }).length;
    const editorCount = allUsers.filter((u) => normalizeUserRole(u.role) === 'editor').length;

    return {
      totalUsers: allUsers.length,
      adminCount,
      editorCount,
      studentCount: Math.max(0, allUsers.length - adminCount - editorCount),
      onlineDevices,
      matDrafts,
      matPub,
      matArch,
      qDrafts,
      qPub,
      qArch,
      discTotal: allManagedDisciplines.length,
      topicTotal: allManagedTopics.length,
      simTotal: allManagedSimuladoLists.length,
      noticePub: allManagedNotices.filter((n) => n.status === 'published').length,
    };
  }, [
    allManagedMaterials,
    allManagedQuestions,
    accessSessions,
    allUsers,
    allManagedDisciplines,
    allManagedTopics,
    allManagedSimuladoLists,
    allManagedNotices,
  ]);

  if (!canAccessAdminPanel) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <SectionCard title="Acesso Restrito" subtitle="Ambiente administrativo protegido por RBAC">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Lock className="h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-600">
              Apenas contas verificadas com perfil Administrador, Editor/Professor ou Desenvolvedor podem acessar este ambiente.
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  const notifyOk = (text: string) => setFeedback({ type: 'ok', text });
  const notifyErr = (err: unknown, fallback: string) =>
    setFeedback({ type: 'err', text: err instanceof Error ? err.message : fallback });

  const callAdminAuthoring = async (
    payload: {
      action: 'draft_material_summary' | 'draft_question' | 'draft_topic' | 'draft_notice';
      disciplineName?: string;
      campusLevel?: LibraryScope;
      title?: string;
      topicTitle?: string;
      contextText?: string;
      url?: string;
    }
  ) => {
    const token = await getIdToken();
    if (!token) {
      throw new Error('Sessão expirada. Entre novamente com sua conta verificada.');
    }
    const res = await fetch('/api/admin/authoring', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { error?: string; draft?: Record<string, unknown> };
    if (!res.ok) {
      throw new Error(json.error || 'Erro ao gerar rascunho com IA.');
    }
    return json.draft || {};
  };

  const handleVerifyBackendRbac = async () => {
    setAiBusy('auth-check');
    setBackendCheckMsg(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Token ausente.');
      const res = await fetch('/api/admin/auth-check', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok?: boolean; role?: string; email?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Falha na verificação backend.');
      setBackendCheckMsg(`Backend RBAC validado: ${data.role} (${data.email})`);
    } catch (err) {
      setBackendCheckMsg(err instanceof Error ? err.message : 'Erro na validação.');
    } finally {
      setAiBusy(null);
    }
  };

  const handleSaveDiscipline = async (status: PublicationStatus) => {
    if (!discName.trim() || !discShortName.trim()) {
      notifyErr(null, 'Preencha nome completo e sigla/nome curto da disciplina.');
      return;
    }
    try {
      await saveManagedDiscipline({
        id: editingDiscId,
        name: discName,
        shortName: discShortName,
        campusLevel: discCampus,
        editalBlock: discBlock,
        priorityRank: discPriority,
        examQuestions: discQuestions,
        examPoints: discPoints,
        tieBreakerOrder: discPriority,
        recommendedMinutesPerCycle: discMinutes,
        status,
      });
      setEditingDiscId(undefined);
      setDiscName('');
      setDiscShortName('');
      notifyOk(
        status === 'published'
          ? 'Disciplina publicada e disponibilizada no ambiente do estudante.'
          : 'Disciplina salva como rascunho.'
      );
    } catch (err) {
      notifyErr(err, 'Erro ao salvar disciplina.');
    }
  };

  const handleSaveTopic = async (status: PublicationStatus) => {
    if (!effectiveDiscForTopic || !topicTitle.trim()) {
      notifyErr(null, 'Selecione a disciplina e informe o título do assunto.');
      return;
    }
    try {
      const subtopics = topicSubtopicsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await saveManagedTopic({
        topicId: editingTopicId,
        disciplineId: effectiveDiscForTopic,
        campusLevel: topicCampus,
        title: topicTitle,
        subtopics,
        highYield: topicHighYield,
        order: topicOrder,
        status,
      });
      setEditingTopicId(undefined);
      setTopicTitle('');
      setTopicSubtopicsText('');
      notifyOk(
        status === 'published'
          ? 'Assunto publicado no edital do estudante.'
          : 'Assunto salvo como rascunho para revisão.'
      );
    } catch (err) {
      notifyErr(err, 'Erro ao salvar assunto.');
    }
  };

  const handleAiDraftTopic = async () => {
    setAiBusy('topic');
    try {
      const discObj = allAvailableDisciplines.find((d) => d.id === effectiveDiscForTopic);
      const draft = await callAdminAuthoring({
        action: 'draft_topic',
        disciplineName: discObj?.name,
        campusLevel: topicCampus,
        topicTitle,
        contextText: topicSubtopicsText,
      });
      if (typeof draft.title === 'string') setTopicTitle(draft.title);
      if (Array.isArray(draft.subtopics)) {
        setTopicSubtopicsText(draft.subtopics.map((s) => String(s)).join('\n'));
      }
      if (typeof draft.highYield === 'boolean') setTopicHighYield(draft.highYield);
      notifyOk('Estrutura de tópico gerada em rascunho pela IA. Revise e pré-visualize antes de publicar.');
    } catch (err) {
      notifyErr(err, 'Erro ao estruturar tópico com IA.');
    } finally {
      setAiBusy(null);
    }
  };

  const handleAdminPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatSelectedFile(file);
    setMatFileType('pdf');
    setMatResourceType('pdf');
    setMatFileSizeBytes(file.size);
    if (!matTitle.trim()) {
      setMatTitle(file.name.replace(/\.pdf$/i, ''));
    }
    if (editingMatId && !matVersionNote.trim()) {
      setMatVersion((v) => Math.max(2, v + 1));
      setMatVersionNote(`Substituição de arquivo (${file.name})`);
    }
    setMatInspecting(true);
    try {
      const result = await inspectPdfMetadata({ file });
      setMatInspectResult(result);
      setMatPageCount(result.pageCount);
      setMatFileSizeBytes(result.fileSizeBytes ?? file.size);
      setMatTextLayerStatus(result.textLayerStatus);
      notifyOk(
        `PDF analisado: ${result.pageCount} páginas · ${
          result.textLayerStatus === 'selectable'
            ? 'Texto selecionável (compatível com Modo Leitura)'
            : result.textLayerStatus === 'scanned'
              ? 'Arquivo digitalizado (imagem — recomendado Modo Livro / Original)'
              : 'Camada mista (digital + imagem)'
        }.`
      );
    } catch (err) {
      notifyErr(err, 'Não foi possível inspecionar a estrutura interna deste PDF.');
    } finally {
      setMatInspecting(false);
    }
  };

  const handleInspectPdf = async () => {
    if (!matSelectedFile && !matUrl.trim()) {
      notifyErr(null, 'Informe o link do PDF ou selecione um arquivo local antes de analisar.');
      return;
    }
    setMatInspecting(true);
    try {
      const result = await inspectPdfMetadata({
        file: matSelectedFile || undefined,
        url: matSelectedFile ? undefined : matUrl.trim(),
        workspaceAccessToken,
      });
      setMatInspectResult(result);
      setMatPageCount(result.pageCount);
      setMatFileSizeBytes(result.fileSizeBytes);
      setMatTextLayerStatus(result.textLayerStatus);
      notifyOk(
        `Metadados extraídos: ${result.pageCount} páginas · ${
          result.textLayerStatus === 'selectable'
            ? 'Texto selecionável'
            : result.textLayerStatus === 'scanned'
              ? 'Digitalizado (sem texto selecionável)'
              : 'Misto'
        }${result.hasOutline ? ' · Possui sumário' : ''}.`
      );
    } catch (err) {
      notifyErr(err, 'Não foi possível inspecionar este PDF diretamente.');
    } finally {
      setMatInspecting(false);
    }
  };

  const resetMaterialForm = () => {
    setEditingMatId(undefined);
    setMatTitle('');
    setMatUrl('');
    setMatEditalTopic('');
    setMatDescription('');
    setMatAllowDownload(true);
    setMatTextLayerStatus('unknown');
    setMatPageCount(undefined);
    setMatFileSizeBytes(undefined);
    setMatVersion(1);
    setMatVersionNote('');
    setMatOriginalUrl('');
    setMatSelectedFile(null);
    setMatInspectResult(null);
  };

  const handleSaveMaterial = async (status: PublicationStatus) => {
    if (!matTitle.trim() || (!matUrl.trim() && !matSelectedFile) || !effectiveDiscForMat) {
      notifyErr(null, 'Informe título, disciplina e arquivo ou URL pública válida do material.');
      return;
    }
    try {
      let safeUrl = matUrl.trim();
      let fileNameToSave: string | undefined = matSelectedFile?.name;

      if (matSelectedFile) {
        const key = `admin_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await saveLocalFile(key, matSelectedFile);
        safeUrl = `local://${key}`;
      } else if (safeUrl.startsWith('local://') || safeUrl.startsWith('/assets/')) {
        // Keep local indexedDB reference or bundled asset path
      } else {
        const normalized = formatSafePublicUrl(safeUrl);
        if (!normalized) {
          notifyErr(null, 'URL inválida. Use link público http://, https://, /assets/ ou anexe um arquivo.');
          return;
        }
        safeUrl = normalized;
      }

      const inferredFileType: MaterialFileType =
        matResourceType === 'video' ? 'video' : matFileType;

      const bumpedVersion =
        editingMatId && matOriginalUrl && matOriginalUrl !== safeUrl && matVersion <= 1
          ? 2
          : matVersion;

      if (editingMatId) {
        await updateMaterial(editingMatId, {
          title: matTitle.trim(),
          disciplineId: effectiveDiscForMat,
          campusLevel: matCampusLevel,
          resourceType: matResourceType,
          fileType: inferredFileType,
          url: safeUrl,
          fileName: fileNameToSave,
          institution: matInstitution.trim(),
          editalTopic: matEditalTopic.trim(),
          relevanceTier: matRelevance,
          description: matDescription.trim(),
          allowDownload: matAllowDownload,
          textLayerStatus: matTextLayerStatus,
          pageCount: matPageCount,
          fileSizeBytes: matFileSizeBytes,
          version: bumpedVersion,
          versionNote: matVersionNote.trim() || undefined,
          status,
          isShared: status === 'published' && !safeUrl.startsWith('local://'),
        });
      } else {
        await addMaterial({
          title: matTitle.trim(),
          disciplineId: effectiveDiscForMat,
          campusLevel: matCampusLevel,
          resourceType: matResourceType,
          fileType: inferredFileType,
          url: safeUrl,
          fileName: fileNameToSave,
          institution: matInstitution.trim(),
          editalTopic: matEditalTopic.trim(),
          relevanceTier: matRelevance,
          description: matDescription.trim(),
          allowDownload: matAllowDownload,
          textLayerStatus: matTextLayerStatus,
          pageCount: matPageCount,
          fileSizeBytes: matFileSizeBytes,
          version: bumpedVersion,
          versionNote: matVersionNote.trim() || undefined,
          status,
          isShared: status === 'published' && !safeUrl.startsWith('local://'),
        });
      }
      const wasEdit = Boolean(editingMatId);
      resetMaterialForm();
      notifyOk(
        status === 'published'
          ? wasEdit
            ? 'Nova versão publicada preservando o histórico de leitura, marcadores e anotações dos estudantes.'
            : 'Material publicado automaticamente no ambiente dos estudantes.'
          : 'Material salvo como rascunho para revisão.'
      );
    } catch (err) {
      notifyErr(err, 'Erro ao salvar material.');
    }
  };

  const handleAiDraftMaterial = async () => {
    setAiBusy('material');
    try {
      const discObj = allAvailableDisciplines.find((d) => d.id === effectiveDiscForMat);
      const draft = await callAdminAuthoring({
        action: 'draft_material_summary',
        disciplineName: discObj?.name,
        campusLevel: matCampusLevel,
        title: matTitle,
        topicTitle: matEditalTopic,
        contextText: matDescription,
        url: matUrl,
      });
      if (typeof draft.description === 'string') setMatDescription(draft.description);
      if (typeof draft.editalTopic === 'string') setMatEditalTopic(draft.editalTopic);
      if (
        draft.relevanceTier === 'essencial' ||
        draft.relevanceTier === 'complementar' ||
        draft.relevanceTier === 'aprofundamento'
      ) {
        setMatRelevance(draft.relevanceTier);
      }
      notifyOk('Resumo e classificação sugeridos pela IA. Revise e pré-visualize antes de publicar.');
    } catch (err) {
      notifyErr(err, 'Erro ao gerar resumo de material com IA.');
    } finally {
      setAiBusy(null);
    }
  };

  const handleSaveQuestion = async (status: PublicationStatus) => {
    if (!qStatement.trim() || qOptions.some((o) => !o.trim()) || !qExplanation.trim()) {
      notifyErr(null, 'Preencha enunciado, todas as 5 alternativas (A–E) e o comentário explicativo.');
      return;
    }
    try {
      if (editingQId) {
        await updateCustomQuestion(editingQId, {
          disciplineId: effectiveDiscForQ,
          escolaridade: qCampus,
          topicTitle: qTopicTitle.trim() || 'Questão de Concurso CETAP',
          originType: qOriginType,
          source: qSource.trim(),
          statement: qStatement.trim(),
          options: qOptions.map((o) => o.trim()) as [string, string, string, string, string],
          correctIndex: qCorrectIndex,
          explanation: qExplanation.trim(),
          legalBasis: qLegalBasis.trim(),
          status,
          isPublished: status === 'published',
        });
      } else {
        await addCustomQuestion({
          disciplineId: effectiveDiscForQ,
          escolaridade: qCampus,
          topicTitle: qTopicTitle.trim() || 'Questão de Concurso CETAP',
          originType: qOriginType,
          source: qSource.trim(),
          statement: qStatement.trim(),
          options: qOptions.map((o) => o.trim()) as [string, string, string, string, string],
          correctIndex: qCorrectIndex,
          explanation: qExplanation.trim(),
          legalBasis: qLegalBasis.trim(),
          status,
          isPublished: status === 'published',
        });
      }
      setEditingQId(undefined);
      setQStatement('');
      setQOptions(['', '', '', '', '']);
      setQExplanation('');
      setQLegalBasis('');
      notifyOk(
        status === 'published'
          ? 'Questão publicada no banco do estudante.'
          : 'Questão salva como rascunho para revisão.'
      );
    } catch (err) {
      notifyErr(err, 'Erro ao salvar questão.');
    }
  };

  const handleAiDraftQuestion = async () => {
    setAiBusy('question');
    try {
      const discObj = allAvailableDisciplines.find((d) => d.id === effectiveDiscForQ);
      const draft = await callAdminAuthoring({
        action: 'draft_question',
        disciplineName: discObj?.name,
        campusLevel: qCampus,
        topicTitle: qTopicTitle,
        contextText: qStatement,
      });
      if (typeof draft.topicTitle === 'string') setQTopicTitle(draft.topicTitle);
      if (typeof draft.statement === 'string') setQStatement(draft.statement);
      if (Array.isArray(draft.options) && draft.options.length === 5) {
        setQOptions(draft.options.map((o) => String(o)) as [string, string, string, string, string]);
      }
      if (typeof draft.correctIndex === 'number') setQCorrectIndex(draft.correctIndex);
      if (typeof draft.explanation === 'string') setQExplanation(draft.explanation);
      if (typeof draft.legalBasis === 'string') setQLegalBasis(draft.legalBasis);
      setQOriginType('ai_generated');
      setQSource('Elaborada com Apoio IA · Revisão Docente');
      notifyOk('Questão rascunhada com IA. Confira gabarito e comentário antes de publicar.');
    } catch (err) {
      notifyErr(err, 'Erro ao elaborar questão com IA.');
    } finally {
      setAiBusy(null);
    }
  };

  const handleSaveSimuladoList = async (status: PublicationStatus) => {
    if (!simTitle.trim() || simQuestionIds.length === 0) {
      notifyErr(null, 'Informe o título da lista e selecione ao menos 1 questão.');
      return;
    }
    try {
      await saveSimuladoList({
        listId: editingSimId,
        title: simTitle,
        description: simDesc,
        campusLevel: simCampus,
        durationMinutes: simDuration,
        questionIds: simQuestionIds,
        status,
      });
      setEditingSimId(undefined);
      setSimTitle('');
      setSimDesc('');
      setSimQuestionIds([]);
      notifyOk(
        status === 'published'
          ? 'Simulado/lista publicado na aba Simulados dos estudantes.'
          : 'Simulado salvo como rascunho.'
      );
    } catch (err) {
      notifyErr(err, 'Erro ao salvar simulado.');
    }
  };

  const handleSaveNotice = async (status: PublicationStatus) => {
    if (!noticeTitle.trim() || !noticeBody.trim()) {
      notifyErr(null, 'Preencha título e conteúdo do aviso.');
      return;
    }
    try {
      await savePlatformNotice({
        noticeId: editingNoticeId,
        title: noticeTitle,
        body: noticeBody,
        campusLevel: noticeCampus,
        priority: noticePriority,
        eventDate: noticeDate || undefined,
        status,
      });
      setEditingNoticeId(undefined);
      setNoticeTitle('');
      setNoticeBody('');
      setNoticeDate('');
      notifyOk(
        status === 'published'
          ? 'Aviso publicado no Painel e Cronograma dos estudantes.'
          : 'Aviso salvo como rascunho.'
      );
    } catch (err) {
      notifyErr(err, 'Erro ao salvar aviso.');
    }
  };

  const handleAiDraftNotice = async () => {
    setAiBusy('notice');
    try {
      const draft = await callAdminAuthoring({
        action: 'draft_notice',
        campusLevel: noticeCampus,
        title: noticeTitle,
        contextText: noticeBody,
      });
      if (typeof draft.title === 'string') setNoticeTitle(draft.title);
      if (typeof draft.body === 'string') setNoticeBody(draft.body);
      if (
        draft.priority === 'normal' ||
        draft.priority === 'importante' ||
        draft.priority === 'urgente'
      ) {
        setNoticePriority(draft.priority);
      }
      notifyOk('Aviso redigido com IA em rascunho. Pré-visualize antes de publicar.');
    } catch (err) {
      notifyErr(err, 'Erro ao redigir aviso com IA.');
    } finally {
      setAiBusy(null);
    }
  };

  const customMaterialsList = useMemo(() => {
    const items = allManagedMaterials.filter((m) => !m.isSystemDefault);
    if (statusFilter === 'all') return items;
    return items.filter((m) => (m.status || (m.isShared ? 'published' : 'draft')) === statusFilter);
  }, [allManagedMaterials, statusFilter]);

  const filteredQuestionsList = useMemo(() => {
    if (statusFilter === 'all') return allManagedQuestions;
    return allManagedQuestions.filter(
      (q) => (q.status || (q.isPublished ? 'published' : 'draft')) === statusFilter
    );
  }, [allManagedQuestions, statusFilter]);

  const filteredUsersList = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return allUsers;
    return allUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        u.uid.toLowerCase().includes(term)
    );
  }, [allUsers, userSearch]);

  const tabs: Array<{ id: AdminSubTab; label: string; icon: React.ComponentType<{ className?: string }>; hidden?: boolean }> = [
    { id: 'estatisticas', label: 'Estatísticas', icon: BarChart3 },
    { id: 'edital', label: 'Disciplinas & Edital', icon: Layers },
    { id: 'materiais', label: 'Materiais, Vídeos & Podcasts', icon: FolderOpen },
    { id: 'questoes', label: 'Questões & Simulados', icon: ClipboardList },
    { id: 'avisos', label: 'Cronograma & Avisos', icon: Bell },
    { id: 'usuarios', label: 'Usuários & Permissões', icon: Users, hidden: !canManageUsers },
  ];

  const renderStatusPill = (status?: PublicationStatus) => {
    const key: PublicationStatus = status || 'published';
    const meta = STATUS_BADGE[key];
    return (
      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
        {meta.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow={`Ambiente Administrativo · ${formatRoleLabel(effectiveRole)}`}
        title="Gestão Institucional ALEPA 2026"
        subtitle="Crie, revise em pré-visualização, publique ou arquive conteúdos sem afetar o histórico. Somente itens Publicados aparecem no ambiente dos estudantes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleVerifyBackendRbac}
              disabled={aiBusy === 'auth-check'}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              {aiBusy === 'auth-check' ? 'Validando...' : 'Validar RBAC Servidor'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveWorkspaceMode('student');
                onOpenStudentPreview?.('dashboard');
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0B3321] px-4 py-2 text-xs font-semibold text-white hover:bg-[#146C43]"
            >
              <Eye className="h-4 w-4" />
              Alternar p/ Visão do Estudante
            </button>
          </div>
        }
      />

      {backendCheckMsg && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <span>{backendCheckMsg}</span>
          <button type="button" onClick={() => setBackendCheckMsg(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="shrink-0 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navigation Sub-tabs + Campus filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {tabs
            .filter((t) => !t.hidden)
            .map((t) => {
              const Icon = t.icon;
              const active = subTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                    active
                      ? 'border-[#0B3321] bg-[#0B3321] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Campus alvo:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['superior', 'medio'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  onChangeCampus(lvl);
                  setDiscCampus(lvl);
                  setTopicCampus(lvl);
                  setMatCampusLevel(lvl);
                  setQCampus(lvl);
                }}
                className={`min-h-[38px] rounded-md px-3 text-xs font-semibold transition ${
                  campus === lvl ? 'bg-emerald-50 text-[#0B3321]' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl === 'superior' ? 'Superior (PL.AL.102)' : 'Médio (PL.AL.060)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 1: ESTATÍSTICAS */}
      {subTab === 'estatisticas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Usuários Totais" value={stats.totalUsers} hint={canManageUsers ? `${stats.studentCount} estudantes` : 'Perfil Editor'} />
            <StatTile label="Sessões Online" value={stats.onlineDevices} hint="PC + Celular" />
            <StatTile label="Materiais Pub." value={stats.matPub} hint={`${stats.matDrafts} rasc. / ${stats.matArch} arq.`} />
            <StatTile label="Questões Autorais" value={stats.qPub} hint={`${stats.qDrafts} rascunhos`} />
            <StatTile label="Edital Custom" value={stats.discTotal + stats.topicTotal} hint={`${stats.discTotal} disc. / ${stats.topicTotal} tóp.`} />
            <StatTile label="Simulados / Avisos" value={`${stats.simTotal} / ${stats.noticePub}`} hint="Listas e comunicados" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Fluxo Editorial & Governança" subtitle="Ciclo seguro de publicação">
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <Edit3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold text-slate-800">1. Rascunho (Draft)</p>
                    <p className="text-xs text-slate-600">Visível exclusivamente para Administradores e Editores. Use a IA para acelerar resumos, questões inéditas e tópicos.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div>
                    <p className="font-semibold text-slate-800">2. Pré-visualização antes da publicação</p>
                    <p className="text-xs text-slate-600">Confira a renderização exata do cartão, player de vídeo/podcast, gabarito da questão ou banner de aviso antes de liberar para os alunos.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <Send className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-slate-800">3. Publicado → 4. Arquivado</p>
                    <p className="text-xs text-slate-600">Itens publicados aparecem automaticamente no ambiente estudantil. Arquivar oculta o item para alunos preservando todo o histórico.</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Dispositivos Conectados" subtitle="Monitoramento de acessos em tempo real">
              {accessSessions.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">Nenhuma sessão ativa registrada ainda.</p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {accessSessions.slice(0, 15).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {s.deviceType === 'mobile' ? (
                          <Smartphone className="h-4 w-4 shrink-0 text-emerald-700" />
                        ) : (
                          <Laptop className="h-4 w-4 shrink-0 text-slate-600" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{s.displayName}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {s.accessType} · {s.activeCampus === 'medio' ? 'Nível Médio' : 'Nível Superior'} · aba {s.currentTab}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${
                          s.isOnline
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        {s.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* TAB 2: DISCIPLINAS & EDITAL */}
      {subTab === 'edital' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard title={editingDiscId ? 'Editar Disciplina' : 'Nova Disciplina Institucional'} subtitle="Organiza a grade de Superior ou Médio">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Escolaridade</label>
                  <select
                    value={discCampus}
                    onChange={(e) => setDiscCampus(e.target.value as CampusLevel)}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="superior">Nível Superior (PL.AL.102)</option>
                    <option value="medio">Nível Médio (PL.AL.060)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Bloco do Edital</label>
                  <select
                    value={discBlock}
                    onChange={(e) => setDiscBlock(e.target.value as Discipline['editalBlock'])}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="Conhecimentos Específicos">Conhecimentos Específicos</option>
                    <option value="Legislação e Ética">Legislação e Ética</option>
                    <option value="Língua Portuguesa">Língua Portuguesa</option>
                    <option value="Raciocínio Lógico">Raciocínio Lógico</option>
                    <option value="Noções de Informática">Noções de Informática</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Nome completo da disciplina</label>
                  <input
                    value={discName}
                    onChange={(e) => setDiscName(e.target.value)}
                    placeholder="Ex.: Regimento Interno da ALEPA"
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Nome curto</label>
                  <input
                    value={discShortName}
                    onChange={(e) => setDiscShortName(e.target.value)}
                    placeholder="Ex.: Regimento"
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Prioridade</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={discPriority}
                    onChange={(e) => setDiscPriority(Number(e.target.value))}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Questões</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={discQuestions}
                    onChange={(e) => setDiscQuestions(Number(e.target.value))}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Pontos</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={0.5}
                    value={discPoints}
                    onChange={(e) => setDiscPoints(Number(e.target.value))}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Ciclo (min)</label>
                  <input
                    type="number"
                    min={15}
                    max={360}
                    value={discMinutes}
                    onChange={(e) => setDiscMinutes(Number(e.target.value))}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleSaveDiscipline('draft')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Salvar Rascunho
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveDiscipline('published')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
                >
                  <Send className="h-4 w-4" />
                  Publicar Disciplina
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={editingTopicId ? 'Editar Tópico do Edital' : 'Cadastrar Assunto / Tópico do Edital'}
            subtitle="Inclui assistência da IA para organizar subtópicos"
            rightSlot={
              <button
                type="button"
                onClick={handleAiDraftTopic}
                disabled={aiBusy === 'topic'}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321] hover:bg-emerald-100"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiBusy === 'topic' ? 'Gerando...' : 'Estruturar com IA'}
              </button>
            }
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Escolaridade</label>
                  <select
                    value={topicCampus}
                    onChange={(e) => {
                      setTopicCampus(e.target.value as CampusLevel);
                      setTopicDisciplineId('');
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="superior">Nível Superior</option>
                    <option value="medio">Nível Médio</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Disciplina</label>
                  <select
                    value={effectiveDiscForTopic}
                    onChange={(e) => setTopicDisciplineId(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {getCampusDisciplines(topicCampus, medioCargoGroup).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Título do assunto no edital</label>
                <input
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  placeholder="Ex.: Processo Legislativo Estadual e Espécies Normativas"
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Subtópicos (um por linha)</label>
                <textarea
                  rows={4}
                  value={topicSubtopicsText}
                  onChange={(e) => setTopicSubtopicsText(e.target.value)}
                  placeholder={'Iniciativa das leis\nEmendas parlamentares\nSanção e veto'}
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={topicHighYield}
                    onChange={(e) => setTopicHighYield(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Alta incidência CETAP
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Ordem:</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={topicOrder}
                    onChange={(e) => setTopicOrder(Number(e.target.value))}
                    className="min-h-[40px] w-20 rounded-lg border border-slate-200 px-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const discObj = getCampusDisciplines(topicCampus, medioCargoGroup).find(
                      (d) => d.id === effectiveDiscForTopic
                    );
                    setPreviewModal({
                      kind: 'topic',
                      disciplineName: discObj?.name || effectiveDiscForTopic,
                      item: {
                        title: topicTitle || 'Prévia de Tópico',
                        subtopics: topicSubtopicsText.split('\n').map((s) => s.trim()).filter(Boolean),
                        highYield: topicHighYield,
                        campusLevel: topicCampus,
                      },
                    });
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" />
                  Pré-visualizar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTopic('draft')}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Rascunho
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTopic('published')}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
                >
                  <Send className="h-4 w-4" />
                  Publicar Tópico
                </button>
              </div>
            </div>
          </SectionCard>

          {/* List of Managed Disciplines & Topics */}
          <SectionCard title="Disciplinas Cadastradas" subtitle={`${allManagedDisciplines.length} disciplina(s) personalizada(s)`}>
            {allManagedDisciplines.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">Nenhuma disciplina adicional cadastrada ainda (as disciplinas base do edital permanecem ativas).</p>
            ) : (
              <div className="space-y-2">
                {allManagedDisciplines.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{d.name}</span>
                        {renderStatusPill(d.status)}
                      </div>
                      <p className="text-xs text-slate-500">
                        {d.campusLevel === 'superior' ? 'Superior' : 'Médio'} · {d.editalBlock} · {d.examQuestions}q
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDiscId(d.id);
                          setDiscName(d.name);
                          setDiscShortName(d.shortName);
                          setDiscCampus(d.campusLevel);
                          setDiscBlock(d.editalBlock);
                          setDiscPriority(d.priorityRank);
                          setDiscQuestions(d.examQuestions);
                          setDiscPoints(d.examPoints);
                          setDiscMinutes(d.recommendedMinutesPerCycle);
                        }}
                        className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      {d.status !== 'published' ? (
                        <button
                          type="button"
                          onClick={() => void updateManagedDisciplineStatus(d.id, 'published')}
                          className="min-h-[36px] rounded bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Publicar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateManagedDisciplineStatus(d.id, 'archived')}
                          className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Arquivar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Tópicos Customizados do Edital" subtitle={`${allManagedTopics.length} tópico(s) gerenciado(s)`}>
            {allManagedTopics.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">Nenhum assunto extra cadastrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {allManagedTopics.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{t.title}</span>
                        {renderStatusPill(t.status)}
                      </div>
                      <p className="text-xs text-slate-500">
                        {t.campusLevel === 'superior' ? 'Superior' : 'Médio'} · {t.subtopics.length} subtópico(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTopicId(t.topicId || t.id);
                          setTopicCampus(t.campusLevel);
                          setTopicDisciplineId(t.disciplineId);
                          setTopicTitle(t.title);
                          setTopicSubtopicsText(t.subtopics.join('\n'));
                          setTopicHighYield(t.highYield);
                          setTopicOrder(t.order);
                        }}
                        className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      {t.status !== 'published' ? (
                        <button
                          type="button"
                          onClick={() => void updateManagedTopicStatus(t.id, 'published')}
                          className="min-h-[36px] rounded bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Publicar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateManagedTopicStatus(t.id, 'archived')}
                          className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Arquivar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB 3: MATERIAIS, VÍDEOS & PODCASTS */}
      {subTab === 'materiais' && (
        <div className="space-y-6">
          <SectionCard
            title={editingMatId ? 'Editar Material / Mídia' : 'Novo Material, PDF, Link, Videoaula ou Podcast'}
            subtitle="Pré-visualize antes de publicar para os estudantes do nível selecionado"
            rightSlot={
              <button
                type="button"
                onClick={handleAiDraftMaterial}
                disabled={aiBusy === 'material'}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321] hover:bg-emerald-100"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiBusy === 'material' ? 'Gerando...' : 'Gerar Resumo IA'}
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Título do material</label>
                <input
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="Ex.: Lei Orgânica & Regimento Comentado em PDF"
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Escolaridade alvo</label>
                <select
                  value={matCampusLevel}
                  onChange={(e) => {
                    setMatCampusLevel(e.target.value as LibraryScope);
                    setMatDisciplineId('');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="geral">Geral (Superior + Médio)</option>
                  <option value="superior">Nível Superior (PL.AL.102)</option>
                  <option value="medio">Nível Médio (PL.AL.060)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Tipo de Recurso</label>
                <select
                  value={matResourceType}
                  onChange={(e) => {
                    const next = e.target.value as ResourceType;
                    setMatResourceType(next);
                    if (next === 'video') setMatFileType('video');
                    else if (next === 'pdf' || next === 'legislacao') setMatFileType('pdf');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="pdf">Apostila / PDF</option>
                  <option value="video">Videoaula</option>
                  <option value="podcast">Podcast / Áudio</option>
                  <option value="legislacao">Legislação / Norma</option>
                  <option value="curso">Curso / Link Externo</option>
                  <option value="livro_digital">Livro Digital</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Disciplina</label>
                <select
                  value={effectiveDiscForMat}
                  onChange={(e) => setMatDisciplineId(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {(matCampusLevel === 'medio'
                    ? getCampusDisciplines('medio', medioCargoGroup)
                    : getCampusDisciplines('superior')
                  ).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Relevância</label>
                <select
                  value={matRelevance}
                  onChange={(e) => setMatRelevance(e.target.value as MaterialRelevanceTier)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="essencial">Essencial</option>
                  <option value="complementar">Complementar</option>
                  <option value="aprofundamento">Aprofundamento</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Link público (PDF, YouTube, Spotify, Drive)</label>
                <input
                  value={matUrl}
                  onChange={(e) => setMatUrl(e.target.value)}
                  placeholder="https://..."
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Instituição / Fonte</label>
                <input
                  value={matInstitution}
                  onChange={(e) => setMatInstitution(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Tópico do Edital & Descrição para o estudante</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={matEditalTopic}
                    onChange={(e) => setMatEditalTopic(e.target.value)}
                    placeholder="Tópico do edital relacionado"
                    className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                  />
                  <input
                    value={matDescription}
                    onChange={(e) => setMatDescription(e.target.value)}
                    placeholder="Breve resumo do que o aluno vai estudar neste material"
                    className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm sm:col-span-2"
                  />
                </div>
              </div>

              {/* Book Reader Admin Controls: PDF Upload, Inspection, Download Permission & Versioning */}
              <div className="sm:col-span-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Gestão Avançada do Leitor Digital (PDF, Digitalização, Download & Versões)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Inspecione se o PDF possui texto selecionável ou é digitalizado, controle download e substitua versões mantendo o histórico do estudante.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Upload className="h-3.5 w-3.5 text-[#0B3321]" />
                      <span>{matSelectedFile ? matSelectedFile.name : 'Enviar PDF local'}</span>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => void handleAdminPdfFileChange(e)}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={matInspecting}
                      onClick={() => void handleInspectPdf()}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321] hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {matInspecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ScanSearch className="h-3.5 w-3.5" />
                      )}
                      <span>{matInspecting ? 'Analisando...' : 'Analisar PDF'}</span>
                    </button>
                  </div>
                </div>

                {(matPageCount !== undefined || matTextLayerStatus !== 'unknown' || matInspectResult) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-500">Páginas</p>
                      <p className="font-mono font-bold text-slate-900">{matPageCount ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Tamanho</p>
                      <p className="font-mono font-bold text-slate-900">
                        {matFileSizeBytes ? `${Math.max(1, Math.round(matFileSizeBytes / 1024))} KB` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Camada de texto</p>
                      <p
                        className={`font-semibold ${
                          matTextLayerStatus === 'scanned' ? 'text-amber-700' : 'text-[#146C43]'
                        }`}
                      >
                        {matTextLayerStatus === 'selectable'
                          ? 'Texto selecionável'
                          : matTextLayerStatus === 'scanned'
                            ? 'Digitalizado (imagem)'
                            : matTextLayerStatus === 'mixed'
                              ? 'Misto (texto + imagem)'
                              : 'Não verificado'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Sumário PDF</p>
                      <p className="font-semibold text-slate-900">
                        {matInspectResult ? (matInspectResult.hasOutline ? 'Disponível' : 'Sem índice') : '—'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer min-h-[38px]">
                      <input
                        type="checkbox"
                        checked={matAllowDownload}
                        onChange={(e) => setMatAllowDownload(e.target.checked)}
                      />
                      <span>Permitir download e abertura externa pelo estudante</span>
                    </label>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">Versão</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={matVersion}
                      onChange={(e) => setMatVersion(Math.max(1, Number(e.target.value) || 1))}
                      className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">Nota da versão</label>
                    <input
                      value={matVersionNote}
                      onChange={(e) => setMatVersionNote(e.target.value)}
                      placeholder="Ex.: Edital retificado"
                      className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setPreviewModal({
                    kind: 'material',
                    item: {
                      id: editingMatId || 'admin_preview',
                      title: matTitle || 'Pré-visualização do Material',
                      resourceType: matResourceType,
                      fileType: matFileType,
                      campusLevel: matCampusLevel,
                      url: matUrl,
                      institution: matInstitution,
                      editalTopic: matEditalTopic,
                      description: matDescription,
                      allowDownload: matAllowDownload,
                      textLayerStatus: matTextLayerStatus,
                      pageCount: matPageCount,
                      version: matVersion,
                    },
                  })
                }
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-4 w-4" />
                Pré-visualizar
              </button>
              <button
                type="button"
                onClick={() => handleSaveMaterial('draft')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Salvar Rascunho
              </button>
              <button
                type="button"
                onClick={() => handleSaveMaterial('published')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
              >
                <Send className="h-4 w-4" />
                {editingMatId ? 'Atualizar Versão & Publicar' : 'Publicar para Estudantes'}
              </button>
              {editingMatId && (
                <button
                  type="button"
                  onClick={resetMaterialForm}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Inventário Editorial de Materiais"
            subtitle="Materiais enviados por administradores e editores"
            rightSlot={
              <div className="flex gap-1">
                {(['all', 'draft', 'published', 'archived'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`min-h-[36px] rounded-md border px-2.5 text-xs font-semibold ${
                      statusFilter === st
                        ? 'border-[#0B3321] bg-[#0B3321] text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {st === 'all' ? 'Todos' : STATUS_BADGE[st].label}
                  </button>
                ))}
              </div>
            }
          >
            {customMaterialsList.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Nenhum material personalizado nesta categoria.</p>
            ) : (
              <div className="space-y-2.5">
                {customMaterialsList.map((m) => {
                  const currentStatus: PublicationStatus = m.status || (m.isShared ? 'published' : 'draft');
                  return (
                    <div key={m.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3.5 sm:flex-row sm:items-center">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {m.resourceType === 'video' ? (
                            <Video className="h-4 w-4 shrink-0 text-rose-600" />
                          ) : m.resourceType === 'podcast' ? (
                            <Headphones className="h-4 w-4 shrink-0 text-emerald-700" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-[#0B3321]" />
                          )}
                          <span className="truncate font-semibold text-slate-900">{m.title}</span>
                          {renderStatusPill(currentStatus)}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {m.campusLevel || 'geral'} · {m.resourceType || m.fileType} · {m.institution || 'Acervo'}
                          {m.version ? ` · v${m.version}` : ''}
                          {m.pageCount ? ` · ${m.pageCount} págs.` : ''}
                          {m.textLayerStatus === 'selectable'
                            ? ' · Texto selecionável'
                            : m.textLayerStatus === 'scanned'
                              ? ' · Digitalizado'
                              : m.textLayerStatus === 'mixed'
                                ? ' · Misto'
                                : ''}
                          {m.allowDownload === false ? ' · Download restrito' : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewModal({ kind: 'material', item: m })}
                          className="min-h-[38px] rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Prévia
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMatId(m.id);
                            setMatTitle(m.title);
                            setMatCampusLevel(m.campusLevel || 'superior');
                            setMatDisciplineId(m.disciplineId);
                            setMatResourceType(m.resourceType || 'pdf');
                            setMatFileType(m.fileType);
                            setMatUrl(m.url);
                            setMatOriginalUrl(m.url);
                            setMatInstitution(m.institution || '');
                            setMatEditalTopic(m.editalTopic || '');
                            setMatRelevance(m.relevanceTier || 'essencial');
                            setMatDescription(m.description || '');
                            setMatAllowDownload(m.allowDownload !== false);
                            setMatTextLayerStatus(m.textLayerStatus || 'unknown');
                            setMatPageCount(m.pageCount);
                            setMatFileSizeBytes(m.fileSizeBytes);
                            setMatVersion(m.version || 1);
                            setMatVersionNote(m.versionNote || '');
                            setMatSelectedFile(null);
                            setMatInspectResult(null);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="min-h-[38px] rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Editar / Versão
                        </button>
                        {currentStatus !== 'published' && (
                          <button
                            type="button"
                            onClick={() => void updateMaterialStatus(m.id, 'published')}
                            className="min-h-[38px] rounded-md bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            Publicar
                          </button>
                        )}
                        {currentStatus === 'published' && (
                          <button
                            type="button"
                            onClick={() => void updateMaterialStatus(m.id, 'archived')}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Arquivar
                          </button>
                        )}
                        {currentStatus === 'archived' && (
                          <button
                            type="button"
                            onClick={() => void updateMaterialStatus(m.id, 'draft')}
                            className="min-h-[38px] rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Reabrir Rascunho
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB 4: QUESTÕES & SIMULADOS */}
      {subTab === 'questoes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard
              title={editingQId ? 'Editar Questão' : 'Cadastrar Questão (5 Alternativas · CETAP)'}
              subtitle="Com suporte a geração assistida por IA e pré-visualização"
              rightSlot={
                <button
                  type="button"
                  onClick={handleAiDraftQuestion}
                  disabled={aiBusy === 'question'}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321] hover:bg-emerald-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {aiBusy === 'question' ? 'Elaborando...' : 'Elaborar com IA'}
                </button>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Escolaridade</label>
                    <select
                      value={qCampus}
                      onChange={(e) => {
                        setQCampus(e.target.value as CampusLevel);
                        setQDisciplineId('');
                      }}
                      className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="superior">Nível Superior</option>
                      <option value="medio">Nível Médio</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Disciplina</label>
                    <select
                      value={effectiveDiscForQ}
                      onChange={(e) => setQDisciplineId(e.target.value)}
                      className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {getCampusDisciplines(qCampus, medioCargoGroup).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    value={qTopicTitle}
                    onChange={(e) => setQTopicTitle(e.target.value)}
                    placeholder="Assunto do edital"
                    className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                  />
                  <select
                    value={qOriginType}
                    onChange={(e) => setQOriginType(e.target.value as QuestionOriginType)}
                    className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="official_cetap">Oficial Fundação CETAP</option>
                    <option value="official_alepa">Oficial ALEPA</option>
                    <option value="training_platform">Treinamento Editorial</option>
                    <option value="ai_generated">Inédita com IA (Revisada)</option>
                  </select>
                </div>

                <textarea
                  rows={3}
                  value={qStatement}
                  onChange={(e) => setQStatement(e.target.value)}
                  placeholder="Enunciado da questão..."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                />

                <div className="space-y-2">
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((letter, idx) => (
                    <div key={letter} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQCorrectIndex(idx)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                          qCorrectIndex === idx
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                        title="Marcar como gabarito correto"
                      >
                        {letter}
                      </button>
                      <input
                        value={qOptions[idx]}
                        onChange={(e) => {
                          const next = [...qOptions] as [string, string, string, string, string];
                          next[idx] = e.target.value;
                          setQOptions(next);
                        }}
                        placeholder={`Alternativa ${letter}`}
                        className="min-h-[40px] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                      />
                    </div>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  placeholder="Comentário explicativo do gabarito..."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                />
                <input
                  value={qLegalBasis}
                  onChange={(e) => setQLegalBasis(e.target.value)}
                  placeholder="Fundamentação legal / doutrinária (opcional)"
                  className="min-h-[40px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                />

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewModal({
                        kind: 'question',
                        item: {
                          topicTitle: qTopicTitle || 'Prévia de Questão',
                          statement: qStatement || 'Enunciado de teste',
                          options: qOptions,
                          correctIndex: qCorrectIndex,
                          explanation: qExplanation,
                          legalBasis: qLegalBasis,
                        },
                      })
                    }
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700"
                  >
                    <Eye className="h-4 w-4" />
                    Pré-visualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveQuestion('draft')}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700"
                  >
                    Rascunho
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveQuestion('published')}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
                  >
                    <Send className="h-4 w-4" />
                    Publicar Questão
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* Simulado List Builder */}
            <SectionCard title="Organizar Simulados & Listas de Exercícios" subtitle="Monte cadernos selecionando questões do banco">
              <div className="space-y-3">
                <input
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  placeholder="Ex.: Simulado Geral CETAP #01 — Legislação + Português"
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    value={simCampus}
                    onChange={(e) => setSimCampus(e.target.value as LibraryScope)}
                    className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="geral">Geral (Todos)</option>
                    <option value="superior">Nível Superior</option>
                    <option value="medio">Nível Médio</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">Duração (min):</span>
                    <input
                      type="number"
                      min={5}
                      max={360}
                      value={simDuration}
                      onChange={(e) => setSimDuration(Number(e.target.value))}
                      className="min-h-[44px] w-24 rounded-lg border border-slate-200 px-3 text-sm"
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={simDesc}
                  onChange={(e) => setSimDesc(e.target.value)}
                  placeholder="Orientações do caderno de simulado..."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                />

                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-700">
                    Selecione questões para esta lista ({simQuestionIds.length} selecionada(s)):
                  </p>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {questions.slice(0, 50).map((q) => {
                      const checked = simQuestionIds.includes(q.id);
                      return (
                        <label
                          key={q.id}
                          className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-xs hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSimQuestionIds((prev) =>
                                e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                              );
                            }}
                            className="mt-0.5 h-4 w-4 rounded"
                          />
                          <span className="line-clamp-2 text-slate-700">
                            <strong className="text-slate-900">[{q.topicTitle}]</strong> {q.statement}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveSimuladoList('draft')}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700"
                  >
                    Salvar Rascunho
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveSimuladoList('published')}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
                  >
                    <Plus className="h-4 w-4" />
                    Publicar Lista
                  </button>
                </div>

                {allManagedSimuladoLists.length > 0 && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-700">Listas cadastradas</p>
                    {allManagedSimuladoLists.map((list: SimuladoList) => (
                      <div key={list.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{list.title}</span>
                            {renderStatusPill(list.status)}
                          </div>
                          <p className="text-slate-500">{list.questionIds.length} questões · {list.durationMinutes} min</p>
                        </div>
                        <div className="flex gap-1.5">
                          {list.status !== 'published' ? (
                            <button
                              type="button"
                              onClick={() => void updateSimuladoListStatus(list.id, 'published')}
                              className="min-h-[34px] rounded bg-emerald-700 px-2.5 font-semibold text-white"
                            >
                              Publicar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void updateSimuladoListStatus(list.id, 'archived')}
                              className="min-h-[34px] rounded border border-slate-200 px-2.5 font-semibold text-slate-600"
                            >
                              Arquivar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Questões Autorais & Banco Compartilhado" subtitle={`${filteredQuestionsList.length} questão(ões)`}>
            {filteredQuestionsList.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">Nenhuma questão personalizada cadastrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {filteredQuestionsList.map((q) => {
                  const st: PublicationStatus = q.status || (q.isPublished ? 'published' : 'draft');
                  return (
                    <div key={q.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[#0B3321]">{q.topicTitle}</span>
                          {renderStatusPill(st)}
                        </div>
                        <p className="line-clamp-2 text-xs text-slate-700">{q.statement}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewModal({ kind: 'question', item: q })}
                          className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-semibold text-slate-700"
                        >
                          Prévia
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQId(q.id);
                            setQCampus(q.escolaridade || 'superior');
                            setQDisciplineId(q.disciplineId);
                            setQTopicTitle(q.topicTitle);
                            setQOriginType(q.originType || 'training_platform');
                            setQSource(q.source || '');
                            setQStatement(q.statement);
                            setQOptions(q.options);
                            setQCorrectIndex(q.correctIndex);
                            setQExplanation(q.explanation);
                            setQLegalBasis(q.legalBasis || '');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-semibold text-slate-700"
                        >
                          Editar
                        </button>
                        {st !== 'published' ? (
                          <button
                            type="button"
                            onClick={() => void updateQuestionStatus(q.id, 'published')}
                            className="min-h-[36px] rounded bg-emerald-700 px-2.5 text-xs font-semibold text-white"
                          >
                            Publicar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void updateQuestionStatus(q.id, 'archived')}
                            className="min-h-[36px] rounded border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
                          >
                            Arquivar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB 5: CRONOGRAMA & AVISOS */}
      {subTab === 'avisos' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title={editingNoticeId ? 'Editar Aviso Institucional' : 'Novo Aviso / Atualização de Cronograma'}
            subtitle="Exibido no Painel Inicial e no Cronograma dos estudantes"
            rightSlot={
              <button
                type="button"
                onClick={handleAiDraftNotice}
                disabled={aiBusy === 'notice'}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiBusy === 'notice' ? 'Redigindo...' : 'Redigir com IA'}
              </button>
            }
          >
            <div className="space-y-3">
              <input
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder="Ex.: Simulado Oficial da Semana liberado!"
                className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <select
                  value={noticeCampus}
                  onChange={(e) => setNoticeCampus(e.target.value as LibraryScope)}
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="geral">Todos os Níveis</option>
                  <option value="superior">Nível Superior</option>
                  <option value="medio">Nível Médio</option>
                </select>
                <select
                  value={noticePriority}
                  onChange={(e) => setNoticePriority(e.target.value as 'normal' | 'importante' | 'urgente')}
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="normal">Prioridade Normal</option>
                  <option value="importante">Importante</option>
                  <option value="urgente">Urgente</option>
                </select>
                <input
                  type="date"
                  value={noticeDate}
                  onChange={(e) => setNoticeDate(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <textarea
                rows={4}
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
                placeholder="Mensagem para os estudantes..."
                className="w-full rounded-lg border border-slate-200 p-3 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewModal({
                      kind: 'notice',
                      item: {
                        title: noticeTitle || 'Prévia do Aviso',
                        body: noticeBody || 'Texto do comunicado.',
                        priority: noticePriority,
                        campusLevel: noticeCampus,
                        eventDate: noticeDate,
                      },
                    })
                  }
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700"
                >
                  <Eye className="h-4 w-4" />
                  Pré-visualizar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNotice('draft')}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700"
                >
                  Rascunho
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNotice('published')}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
                >
                  <Send className="h-4 w-4" />
                  Publicar Aviso
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Avisos Cadastrados" subtitle={`${allManagedNotices.length} aviso(s)`}>
            {allManagedNotices.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Nenhum aviso institucional cadastrado ainda.</p>
            ) : (
              <div className="space-y-2.5">
                {allManagedNotices.map((n) => (
                  <div key={n.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{n.title}</span>
                        {renderStatusPill(n.status)}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoticeId(n.noticeId || n.id);
                            setNoticeTitle(n.title);
                            setNoticeBody(n.body);
                            setNoticeCampus(n.campusLevel);
                            setNoticePriority(n.priority);
                            setNoticeDate(n.eventDate || '');
                          }}
                          className="min-h-[34px] rounded border border-slate-200 px-2.5 text-xs font-semibold text-slate-700"
                        >
                          Editar
                        </button>
                        {n.status !== 'published' ? (
                          <button
                            type="button"
                            onClick={() => void updatePlatformNoticeStatus(n.id, 'published')}
                            className="min-h-[34px] rounded bg-emerald-700 px-2.5 text-xs font-semibold text-white"
                          >
                            Publicar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void updatePlatformNoticeStatus(n.id, 'archived')}
                            className="min-h-[34px] rounded border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
                          >
                            Arquivar
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB 6: USUÁRIOS & PERMISSÕES (ADMIN / DEV ONLY) */}
      {subTab === 'usuarios' && canManageUsers && (
        <SectionCard
          title="Gestão de Usuários e Permissões (RBAC)"
          subtitle="Defina quem possui perfil Estudante, Editor/Professor, Administrador ou Desenvolvedor"
          rightSlot={
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="min-h-[40px] w-full rounded-lg border border-slate-200 px-3 text-xs sm:w-64"
            />
          }
        >
          {filteredUsersList.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Nenhum usuário encontrado.</p>
          ) : (
            <div className="space-y-2">
              {filteredUsersList.map((u) => {
                const currentNormalized = normalizeUserRole(u.role);
                const isSelf = u.uid === user?.uid;
                return (
                  <div
                    key={u.uid}
                    className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{u.displayName}</span>
                        {isSelf && (
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Você
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {u.email || u.uid} · Meta {u.dailyGoalMinutes} min/dia
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={currentNormalized}
                        disabled={isSelf}
                        onChange={(e) => {
                          const next = e.target.value as NormalizedUserRole;
                          void updateUserRole(u.uid, next)
                            .then(() => notifyOk(`Perfil de ${u.displayName} atualizado para ${formatRoleLabel(next)}.`))
                            .catch((err) => notifyErr(err, 'Falha ao atualizar perfil.'));
                        }}
                        className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-60"
                      >
                        <option value="student">Estudante</option>
                        <option value="editor">Editor / Professor</option>
                        <option value="admin">Administrador</option>
                        <option value="dev">Desenvolvedor</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* PRE-VISUALIZAÇÃO MODAL ANTES DA PUBLICAÇÃO */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Pré-visualização no Ambiente do Estudante
                </p>
                <h3 className="text-base font-bold text-slate-900">Conferência antes da publicação</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {previewModal.kind === 'material' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-800">
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 uppercase">
                      {previewModal.item.resourceType || previewModal.item.fileType || 'material'}
                    </span>
                    <span className="text-slate-500">
                      {previewModal.item.campusLevel === 'medio'
                        ? 'Nível Médio'
                        : previewModal.item.campusLevel === 'superior'
                          ? 'Nível Superior'
                          : 'Geral (Superior + Médio)'}
                    </span>
                  </div>
                  <h4 className="mt-2 text-lg font-bold text-slate-900">{previewModal.item.title}</h4>
                  {previewModal.item.editalTopic && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Tópico: {previewModal.item.editalTopic}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-700">
                    {previewModal.item.description || 'Sem descrição adicional informada.'}
                  </p>
                  {previewModal.item.url && (
                    <p className="mt-2 break-all text-xs text-slate-500">Link: {previewModal.item.url}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-600">
                    Versão {previewModal.item.version || 1}
                    {previewModal.item.pageCount ? ` · ${previewModal.item.pageCount} págs.` : ''}
                    {previewModal.item.textLayerStatus && previewModal.item.textLayerStatus !== 'unknown'
                      ? ` · ${
                          previewModal.item.textLayerStatus === 'scanned'
                            ? 'PDF digitalizado'
                            : previewModal.item.textLayerStatus === 'mixed'
                              ? 'Camada mista'
                              : 'Texto selecionável'
                        }`
                      : ''}
                    {previewModal.item.allowDownload === false
                      ? ' · Download bloqueado'
                      : ' · Download permitido'}
                  </p>
                </div>

                {previewModal.item.url &&
                  isPdfReadableMaterial({
                    url: previewModal.item.url,
                    fileType: previewModal.item.fileType || 'pdf',
                    resourceType: previewModal.item.resourceType,
                    fileName: previewModal.item.fileName,
                  }) && (
                    <button
                      type="button"
                      onClick={() => {
                        const target: StudyMaterial = {
                          id: previewModal.item.id || 'admin_preview',
                          ownerId: user?.uid || 'admin',
                          title: previewModal.item.title || 'Prévia PDF',
                          disciplineId: previewModal.item.disciplineId || effectiveDiscForMat,
                          fileType: previewModal.item.fileType || 'pdf',
                          resourceType: previewModal.item.resourceType,
                          url: previewModal.item.url || '',
                          institution: previewModal.item.institution,
                          allowDownload: previewModal.item.allowDownload,
                          pageCount: previewModal.item.pageCount,
                          version: previewModal.item.version,
                          isShared: false,
                        };
                        setPreviewModal(null);
                        setAdminReaderPreview(target);
                      }}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>Testar no Book Reader</span>
                    </button>
                  )}

                {previewModal.item.url && (() => {
                  const embed = getVideoEmbedInfo(previewModal.item.url || '');
                  if (!embed?.embedUrl) return null;
                  return (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <iframe
                        src={embed.embedUrl}
                        title="Prévia do player"
                        className="aspect-video w-full"
                        allowFullScreen
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {previewModal.kind === 'question' && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase text-emerald-700">{previewModal.item.topicTitle}</p>
                <p className="text-sm font-medium text-slate-900">{previewModal.item.statement}</p>
                <div className="space-y-2">
                  {(previewModal.item.options || []).map((opt, idx) => {
                    const letters = ['A', 'B', 'C', 'D', 'E'];
                    const isCorrect = idx === previewModal.item.correctIndex;
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          isCorrect
                            ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <strong>{letters[idx]})</strong> {opt}
                      </div>
                    );
                  })}
                </div>
                {previewModal.item.explanation && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <strong>Comentário:</strong> {previewModal.item.explanation}
                    {previewModal.item.legalBasis && (
                      <p className="mt-1 font-medium text-emerald-800">Base: {previewModal.item.legalBasis}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {previewModal.kind === 'notice' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-800">
                  <Bell className="h-4 w-4" />
                  <span>{previewModal.item.priority || 'importante'}</span>
                  {previewModal.item.eventDate && <span>· {previewModal.item.eventDate}</span>}
                </div>
                <h4 className="mt-2 text-base font-bold text-slate-900">{previewModal.item.title}</h4>
                <p className="mt-1 text-sm text-slate-700">{previewModal.item.body}</p>
              </div>
            )}

            {previewModal.kind === 'topic' && (
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-emerald-700">{previewModal.disciplineName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#0B3321]" />
                  <h4 className="text-base font-bold text-slate-900">{previewModal.item.title}</h4>
                  {previewModal.item.highYield && (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Alta Incidência
                    </span>
                  )}
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700">
                  {(previewModal.item.subtopics || []).map((st, idx) => (
                    <li key={idx}>{st}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Fechar Pré-visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {adminReaderPreview && (
        <BookReaderModal
          material={adminReaderPreview}
          onClose={() => setAdminReaderPreview(null)}
        />
      )}
    </div>
  );
}
