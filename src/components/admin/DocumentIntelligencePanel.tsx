import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  CloudUpload,
  Eye,
  FileText,
  Headphones,
  Link2,
  Loader2,
  ScanSearch,
  Send,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ALEPA_DISCIPLINES } from '../../data/alepaSyllabus';
import { getMedioDisciplines } from '../../data/alepaMedioSyllabus';
import {
  CampusLevel,
  LibraryScope,
  MaterialFileType,
  MaterialRelevanceTier,
  MedioCargoGroup,
  PublicationStatus,
  ResourceType,
  StorageMetadataRecord,
  StorageProviderType,
  StudyMaterial,
} from '../../types';
import { SectionCard } from '../ui/CampusPrimitives';
import { formatSafePublicUrl } from '../../utils/mediaUrls';
import { inspectPdfMetadata, PdfInspectionResult } from '../../lib/pdfBookEngine';
import { saveLocalFile } from '../../lib/localFiles';
import {
  computeFileSha256,
  formatBytes,
  inferStorageCategory,
  uploadFileToCloudStorage,
} from '../../lib/storageService';
import { ADMIN_STATUS_BADGE, renderAdminStatusBadge } from './adminShared';

interface AiClassificationSuggestion {
  suggestedTitle: string;
  suggestedDisciplineId: string;
  suggestedTopic: string;
  suggestedCampusLevel: LibraryScope;
  suggestedRelevanceTier: MaterialRelevanceTier;
  suggestedSummary: string;
  suggestedKeywords: string[];
}

interface DocumentIntelligencePanelProps {
  campus: CampusLevel;
  medioCargoGroup: MedioCargoGroup;
  onNotifyOk: (msg: string) => void;
  onNotifyErr: (err: unknown, fallback: string) => void;
  onPreviewMaterial: (mat: Partial<StudyMaterial>) => void;
  onOpenBookReader: (mat: StudyMaterial) => void;
  callAdminAuthoring: (payload: {
    action: 'draft_material_summary' | 'draft_question' | 'draft_topic' | 'draft_notice';
    disciplineName?: string;
    campusLevel?: LibraryScope;
    title?: string;
    topicTitle?: string;
    contextText?: string;
    url?: string;
  }) => Promise<Record<string, unknown>>;
}

export function DocumentIntelligencePanel({
  campus,
  medioCargoGroup,
  onNotifyOk,
  onNotifyErr,
  onPreviewMaterial,
  onOpenBookReader,
  callAdminAuthoring,
}: DocumentIntelligencePanelProps) {
  const {
    user,
    canManageUsers,
    getIdToken,
    workspaceAccessToken,
    allManagedMaterials,
    storageMetadataRecords,
    getCampusDisciplines,
    addMaterial,
    updateMaterial,
    updateMaterialStatus,
    registerStorageMetadata,
    updateStorageMetadataRecord,
    writeAuditLog,
  } = useAuth();

  const [editingMatId, setEditingMatId] = useState<string | undefined>(undefined);
  const [matTitle, setMatTitle] = useState('');
  const [matCampusLevel, setMatCampusLevel] = useState<LibraryScope>(campus);
  const [matDisciplineId, setMatDisciplineId] = useState('');
  const [matResourceType, setMatResourceType] = useState<ResourceType>('pdf');
  const [matFileType, setMatFileType] = useState<MaterialFileType>('pdf');
  const [matUrl, setMatUrl] = useState('');
  const [matInstitution, setMatInstitution] = useState('ALEPA / Curadoria Docente');
  const [matEditalTopic, setMatEditalTopic] = useState('');
  const [matRelevance, setMatRelevance] = useState<MaterialRelevanceTier>('essencial');
  const [matDescription, setMatDescription] = useState('');
  const [matAuthor, setMatAuthor] = useState('');
  const [matEdition, setMatEdition] = useState('');
  const [matYear, setMatYear] = useState<number>(2026);
  const [matKeywordsText, setMatKeywordsText] = useState('');
  const [matAllowDownload, setMatAllowDownload] = useState(true);
  const [matTextLayerStatus, setMatTextLayerStatus] = useState<
    'selectable' | 'scanned' | 'mixed' | 'unknown'
  >('unknown');
  const [matPageCount, setMatPageCount] = useState<number | undefined>(undefined);
  const [matFileSizeBytes, setMatFileSizeBytes] = useState<number | undefined>(undefined);
  const [matChecksumSha256, setMatChecksumSha256] = useState<string>('');
  const [matStorageProvider, setMatStorageProvider] = useState<StorageProviderType>('external');
  const [matStoragePath, setMatStoragePath] = useState<string>('');
  const [matStorageMetaId, setMatStorageMetaId] = useState<string>('');
  const [matVersion, setMatVersion] = useState<number>(1);
  const [matVersionNote, setMatVersionNote] = useState('');
  const [matReviewNotes, setMatReviewNotes] = useState('');
  const [matOriginalUrl, setMatOriginalUrl] = useState('');
  const [matSelectedFile, setMatSelectedFile] = useState<File | null>(null);
  const [matUploadMode, setMatUploadMode] = useState<'local' | 'cloud'>(
    canManageUsers ? 'cloud' : 'local'
  );
  const [cloudProgress, setCloudProgress] = useState<number | null>(null);
  const [matInspecting, setMatInspecting] = useState(false);
  const [matInspectResult, setMatInspectResult] = useState<PdfInspectionResult | null>(null);

  const [aiBusy, setAiBusy] = useState<'summary' | 'classify' | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiClassificationSuggestion | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | PublicationStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const campusDisciplines = useMemo(
    () =>
      matCampusLevel === 'medio'
        ? getCampusDisciplines('medio', medioCargoGroup)
        : getCampusDisciplines('superior'),
    [getCampusDisciplines, matCampusLevel, medioCargoGroup]
  );

  const effectiveDiscForMat =
    matDisciplineId ||
    (matCampusLevel === 'medio' ? getMedioDisciplines(medioCargoGroup)[0]?.id : ALEPA_DISCIPLINES[0]?.id) ||
    '';

  const duplicateMatches = useMemo(() => {
    const matches: StudyMaterial[] = [];
    const normTitle = matTitle.trim().toLowerCase();
    for (const m of allManagedMaterials) {
      if (editingMatId && m.id === editingMatId) continue;
      if (matChecksumSha256 && m.checksumSha256 && m.checksumSha256 === matChecksumSha256) {
        matches.push(m);
        continue;
      }
      if (normTitle.length >= 8 && m.title.trim().toLowerCase() === normTitle) {
        matches.push(m);
      }
    }
    return matches;
  }, [allManagedMaterials, editingMatId, matChecksumSha256, matTitle]);

  const orphanStorageObjects = useMemo(() => {
    const linkedUrls = new Set(allManagedMaterials.map((m) => (m.url || '').trim()));
    const linkedPaths = new Set(
      allManagedMaterials.map((m) => (m.storagePath || '').trim()).filter(Boolean)
    );
    const linkedIds = new Set(allManagedMaterials.map((m) => m.id));
    return storageMetadataRecords.filter((rec) => {
      if (rec.archived) return false;
      if (rec.linkedMaterialId && linkedIds.has(rec.linkedMaterialId)) return false;
      if (linkedUrls.has(rec.downloadUrl) || linkedPaths.has(rec.objectPath)) return false;
      return true;
    });
  }, [allManagedMaterials, storageMetadataRecords]);

  const customMaterialsList = useMemo(() => {
    const items = allManagedMaterials.filter((m) => !m.isSystemDefault);
    const term = searchTerm.trim().toLowerCase();
    return items.filter((m) => {
      const currentStatus: PublicationStatus = m.status || (m.isShared ? 'published' : 'draft');
      if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;
      if (!term) return true;
      return (
        m.title.toLowerCase().includes(term) ||
        (m.editalTopic || '').toLowerCase().includes(term) ||
        (m.institution || '').toLowerCase().includes(term)
      );
    });
  }, [allManagedMaterials, statusFilter, searchTerm]);

  const resetForm = () => {
    setEditingMatId(undefined);
    setMatTitle('');
    setMatUrl('');
    setMatEditalTopic('');
    setMatDescription('');
    setMatAuthor('');
    setMatEdition('');
    setMatYear(2026);
    setMatKeywordsText('');
    setMatAllowDownload(true);
    setMatTextLayerStatus('unknown');
    setMatPageCount(undefined);
    setMatFileSizeBytes(undefined);
    setMatChecksumSha256('');
    setMatStorageProvider('external');
    setMatStoragePath('');
    setMatStorageMetaId('');
    setMatVersion(1);
    setMatVersionNote('');
    setMatReviewNotes('');
    setMatOriginalUrl('');
    setMatSelectedFile(null);
    setMatInspectResult(null);
    setAiSuggestion(null);
  };

  const handleLocalFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setMatVersionNote(`Nova versão (${file.name})`);
    }
    setMatInspecting(true);
    try {
      const [result, sha] = await Promise.all([
        inspectPdfMetadata({ file }),
        computeFileSha256(file),
      ]);
      setMatInspectResult(result);
      setMatPageCount(result.pageCount);
      setMatFileSizeBytes(result.fileSizeBytes ?? file.size);
      setMatTextLayerStatus(result.textLayerStatus);
      setMatChecksumSha256(sha);
      if (result.metadataAuthor && !matAuthor.trim()) {
        setMatAuthor(result.metadataAuthor);
      }
      onNotifyOk(
        `PDF inspecionado: ${result.pageCount} páginas · ${
          result.textLayerStatus === 'selectable'
            ? 'Texto selecionável'
            : result.textLayerStatus === 'scanned'
              ? 'Digitalizado (sem texto selecionável)'
              : 'Camada mista'
        }${sha ? ` · SHA-256 ${sha.slice(0, 10)}…` : ''}`
      );
    } catch (err) {
      onNotifyErr(err, 'Não foi possível inspecionar este PDF.');
    } finally {
      setMatInspecting(false);
    }
  };

  const handleInspectUrlOrFile = async () => {
    if (!matSelectedFile && !matUrl.trim()) {
      onNotifyErr(null, 'Informe um link público/Drive ou anexe um arquivo PDF antes de analisar.');
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
      if (matSelectedFile) {
        const sha = await computeFileSha256(matSelectedFile);
        setMatChecksumSha256(sha);
      }
      if (result.metadataAuthor && !matAuthor.trim()) {
        setMatAuthor(result.metadataAuthor);
      }
      onNotifyOk(
        `Metadados lidos: ${result.pageCount} págs.${
          result.hasOutline ? ' · Possui sumário' : ''
        } · ${
          result.textLayerStatus === 'selectable'
            ? 'Texto selecionável'
            : result.textLayerStatus === 'scanned'
              ? 'Digitalizado'
              : 'Misto'
        }.`
      );
    } catch (err) {
      onNotifyErr(err, 'Falha na inspeção deste PDF.');
    } finally {
      setMatInspecting(false);
    }
  };

  const handleAiClassifyDocument = async () => {
    if (!matTitle.trim() && !matSelectedFile && !matInspectResult?.sampleSnippet && !matDescription.trim()) {
      onNotifyErr(
        null,
        'Preencha o título, descrição ou inspecione o PDF para enviar contexto real à IA.'
      );
      return;
    }
    setAiBusy('classify');
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sessão expirada.');
      const res = await fetch('/api/ai/classify-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: matTitle.trim(),
          fileName: matSelectedFile?.name || '',
          metadataTitle: matInspectResult?.metadataTitle,
          metadataAuthor: matInspectResult?.metadataAuthor || matAuthor,
          sampleSnippet: matInspectResult?.sampleSnippet || matDescription,
          outlineTitles: matInspectResult?.outlineTitles,
          campusLevel: matCampusLevel,
          availableDisciplines: campusDisciplines.map((d) => ({ id: d.id, name: d.name })),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        suggestion?: AiClassificationSuggestion;
      };
      if (!res.ok || !json.suggestion) {
        throw new Error(json.error || 'Erro ao classificar documento.');
      }
      setAiSuggestion(json.suggestion);
      onNotifyOk('Sugestão de catalogação gerada pela IA. Revise e clique em Aplicar se concordar.');
    } catch (err) {
      onNotifyErr(err, 'Erro ao classificar documento com IA.');
    } finally {
      setAiBusy(null);
    }
  };

  const handleAiQuickSummary = async () => {
    setAiBusy('summary');
    try {
      const discObj = campusDisciplines.find((d) => d.id === effectiveDiscForMat);
      const draft = await callAdminAuthoring({
        action: 'draft_material_summary',
        disciplineName: discObj?.name,
        campusLevel: matCampusLevel,
        title: matTitle,
        topicTitle: matEditalTopic,
        contextText: matInspectResult?.sampleSnippet || matDescription,
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
      onNotifyOk('Resumo sugerido pela IA. Revise antes de salvar.');
    } catch (err) {
      onNotifyErr(err, 'Erro ao gerar resumo IA.');
    } finally {
      setAiBusy(null);
    }
  };

  const handleSaveMaterial = async (status: PublicationStatus) => {
    if (!matTitle.trim() || (!matUrl.trim() && !matSelectedFile) || !effectiveDiscForMat) {
      onNotifyErr(null, 'Informe título, disciplina e arquivo ou URL pública válida.');
      return;
    }
    try {
      let safeUrl = matUrl.trim();
      let fileNameToSave: string | undefined = matSelectedFile?.name;
      let providerToSave: StorageProviderType = matStorageProvider;
      let storagePathToSave = matStoragePath;
      let checksumToSave = matChecksumSha256;
      let createdMetaId = matStorageMetaId;

      if (matSelectedFile) {
        if (matUploadMode === 'cloud' && canManageUsers && user) {
          setCloudProgress(1);
          try {
            const uploaded = await uploadFileToCloudStorage({
              file: matSelectedFile,
              uploaderUid: user.uid,
              folder: 'campus-materials',
              onProgress: (p) => setCloudProgress(p),
            });
            safeUrl = uploaded.downloadUrl;
            providerToSave = 'firebase_storage';
            storagePathToSave = uploaded.objectPath;
            checksumToSave = uploaded.checksumSha256 || checksumToSave;
            createdMetaId = await registerStorageMetadata({
              fileName: matSelectedFile.name,
              mimeType: uploaded.mimeType,
              sizeBytes: uploaded.sizeBytes,
              checksumSha256: checksumToSave,
              storageProvider: 'firebase_storage',
              bucket: uploaded.bucket,
              objectPath: uploaded.objectPath,
              downloadUrl: uploaded.downloadUrl,
              category: inferStorageCategory(uploaded.mimeType, matSelectedFile.name),
              campusLevel: matCampusLevel,
              linkedMaterialId: editingMatId,
              version: matVersion,
            });
          } finally {
            setCloudProgress(null);
          }
        } else {
          const key = `admin_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await saveLocalFile(key, matSelectedFile);
          safeUrl = `local://${key}`;
          providerToSave = 'local';
        }
      } else if (safeUrl.startsWith('local://')) {
        providerToSave = 'local';
      } else if (safeUrl.startsWith('/assets/')) {
        providerToSave = 'external';
      } else {
        const normalized = formatSafePublicUrl(safeUrl);
        if (!normalized) {
          onNotifyErr(null, 'URL inválida. Use http://, https://, /assets/ ou anexe arquivo.');
          return;
        }
        safeUrl = normalized;
        if (safeUrl.includes('drive.google.com') || safeUrl.includes('docs.google.com')) {
          providerToSave = 'google_drive';
        }
      }

      const inferredFileType: MaterialFileType =
        matResourceType === 'video' ? 'video' : matFileType;
      const bumpedVersion =
        editingMatId && matOriginalUrl && matOriginalUrl !== safeUrl && matVersion <= 1
          ? 2
          : matVersion;
      const keywords = matKeywordsText
        .split(/[,;]+/)
        .map((k) => k.trim())
        .filter(Boolean);

      const payload = {
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
        author: matAuthor.trim() || undefined,
        edition: matEdition.trim() || undefined,
        year: Number(matYear) || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        checksumSha256: checksumToSave || undefined,
        storageProvider: providerToSave,
        storagePath: storagePathToSave || undefined,
        reviewNotes: matReviewNotes.trim() || undefined,
        allowDownload: matAllowDownload,
        textLayerStatus: matTextLayerStatus,
        pageCount: matPageCount,
        fileSizeBytes: matFileSizeBytes,
        version: bumpedVersion,
        versionNote: matVersionNote.trim() || undefined,
        status,
        isShared: status === 'published' && !safeUrl.startsWith('local://'),
      };

      if (editingMatId) {
        await updateMaterial(editingMatId, payload);
        if (createdMetaId) {
          await updateStorageMetadataRecord(createdMetaId, {
            linkedMaterialId: editingMatId,
            campusLevel: matCampusLevel,
            version: bumpedVersion,
          });
        }
        await writeAuditLog({
          action: 'update_material',
          targetCollection: 'materials',
          targetId: editingMatId,
          summary: `Material "${payload.title}" atualizado (v${bumpedVersion}, ${status})`,
        });
      } else {
        await addMaterial(payload);
        await writeAuditLog({
          action: 'create_material',
          targetCollection: 'materials',
          targetId: payload.title.slice(0, 60),
          summary: `Novo material "${payload.title}" (${status})`,
        });
      }

      const wasEdit = Boolean(editingMatId);
      resetForm();
      onNotifyOk(
        status === 'published'
          ? wasEdit
            ? 'Material atualizado preservando o histórico de leitura dos estudantes.'
            : 'Material publicado no ambiente dos estudantes.'
          : `Material salvo com status "${ADMIN_STATUS_BADGE[status].label}".`
      );
    } catch (err) {
      onNotifyErr(err, 'Erro ao salvar material.');
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={
          editingMatId
            ? 'Editar / Substituir Versão de Documento'
            : 'Central Inteligente de Documentos & Materiais'
        }
        subtitle="Inspecione PDFs, detecte duplicidade por SHA-256, classifique com apoio da IA e publique em fluxo seguro"
        rightSlot={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleAiClassifyDocument()}
              disabled={aiBusy !== null}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy === 'classify' ? 'Classificando...' : 'Classificar com IA'}
            </button>
            <button
              type="button"
              onClick={() => void handleAiQuickSummary()}
              disabled={aiBusy !== null}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321] hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy === 'summary' ? 'Resumindo...' : 'Resumo IA'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {duplicateMatches.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold">Possível duplicidade detectada no acervo:</p>
                <p>
                  {duplicateMatches.map((d) => `${d.title} (v${d.version || 1})`).join(' · ')} — caso queira substituir a versão sem perder o histórico de leitura dos alunos, clique em "Editar / Versão" no item existente.
                </p>
              </div>
            </div>
          )}

          {aiSuggestion && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs dark:border-indigo-800 dark:bg-indigo-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-indigo-900 dark:text-indigo-200">
                  Sugestão da IA (Revisão Humana Obrigatória)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMatTitle(aiSuggestion.suggestedTitle || matTitle);
                      if (aiSuggestion.suggestedDisciplineId) {
                        setMatDisciplineId(aiSuggestion.suggestedDisciplineId);
                      }
                      setMatEditalTopic(aiSuggestion.suggestedTopic || matEditalTopic);
                      setMatCampusLevel(aiSuggestion.suggestedCampusLevel);
                      setMatRelevance(aiSuggestion.suggestedRelevanceTier);
                      setMatDescription(aiSuggestion.suggestedSummary || matDescription);
                      if (aiSuggestion.suggestedKeywords.length > 0) {
                        setMatKeywordsText(aiSuggestion.suggestedKeywords.join(', '));
                      }
                      setAiSuggestion(null);
                      onNotifyOk('Sugestão aplicada aos campos do formulário. Confira antes de salvar.');
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-indigo-700 px-3 font-semibold text-white hover:bg-indigo-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aplicar ao Formulário
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSuggestion(null)}
                    className="min-h-[34px] rounded-lg border border-indigo-200 px-2.5 text-indigo-700 dark:border-indigo-700 dark:text-indigo-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
                <p>
                  <strong>Título:</strong> {aiSuggestion.suggestedTitle} ·{' '}
                  <strong>Escolaridade:</strong> {aiSuggestion.suggestedCampusLevel} ·{' '}
                  <strong>Relevância:</strong> {aiSuggestion.suggestedRelevanceTier}
                </p>
                <p>
                  <strong>Tópico:</strong> {aiSuggestion.suggestedTopic}
                </p>
                <p>
                  <strong>Resumo:</strong> {aiSuggestion.suggestedSummary}
                </p>
                {aiSuggestion.suggestedKeywords.length > 0 && (
                  <p>
                    <strong>Palavras-chave:</strong> {aiSuggestion.suggestedKeywords.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Título do material
              </label>
              <input
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="Ex.: Lei Orgânica & Regimento Comentado em PDF"
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Escolaridade alvo
              </label>
              <select
                value={matCampusLevel}
                onChange={(e) => {
                  setMatCampusLevel(e.target.value as LibraryScope);
                  setMatDisciplineId('');
                }}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="geral">Geral (Superior + Médio)</option>
                <option value="superior">Nível Superior (PL.AL.102)</option>
                <option value="medio">Nível Médio (PL.AL.060)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tipo de Recurso
              </label>
              <select
                value={matResourceType}
                onChange={(e) => {
                  const next = e.target.value as ResourceType;
                  setMatResourceType(next);
                  if (next === 'video') setMatFileType('video');
                  else if (next === 'pdf' || next === 'legislacao' || next === 'livro_digital') {
                    setMatFileType('pdf');
                  }
                }}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="pdf">Apostila / PDF</option>
                <option value="livro_digital">Livro Digital</option>
                <option value="video">Videoaula</option>
                <option value="podcast">Podcast / Áudio</option>
                <option value="legislacao">Legislação / Norma</option>
                <option value="curso">Curso / Link Externo</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Disciplina
              </label>
              <select
                value={effectiveDiscForMat}
                onChange={(e) => setMatDisciplineId(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {campusDisciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Relevância
              </label>
              <select
                value={matRelevance}
                onChange={(e) => setMatRelevance(e.target.value as MaterialRelevanceTier)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="essencial">Essencial</option>
                <option value="complementar">Complementar</option>
                <option value="aprofundamento">Aprofundamento</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Link público (PDF, YouTube, Spotify, Drive ou Storage)
              </label>
              <input
                value={matUrl}
                onChange={(e) => setMatUrl(e.target.value)}
                placeholder="https://..."
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Instituição / Fonte
              </label>
              <input
                value={matInstitution}
                onChange={(e) => setMatInstitution(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Autor / Prof.
              </label>
              <input
                value={matAuthor}
                onChange={(e) => setMatAuthor(e.target.value)}
                placeholder="Opcional"
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Edição / Ano
              </label>
              <div className="flex gap-2">
                <input
                  value={matEdition}
                  onChange={(e) => setMatEdition(e.target.value)}
                  placeholder="Ed. 2026"
                  className="min-h-[42px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <input
                  type="number"
                  min={1990}
                  max={2035}
                  value={matYear}
                  onChange={(e) => setMatYear(Number(e.target.value))}
                  className="min-h-[42px] w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Palavras-chave (separadas por vírgula)
              </label>
              <input
                value={matKeywordsText}
                onChange={(e) => setMatKeywordsText(e.target.value)}
                placeholder="regimento, processo legislativo, alepa"
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="sm:col-span-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={matEditalTopic}
                onChange={(e) => setMatEditalTopic(e.target.value)}
                placeholder="Tópico do edital relacionado"
                className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                value={matDescription}
                onChange={(e) => setMatDescription(e.target.value)}
                placeholder="Resumo pedagógico exibido ao estudante"
                className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          {/* PDF Inspection & Storage Box */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Inspeção Técnica de PDF, Armazenamento & Versionamento
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Verifica camada de texto, páginas, hash SHA-256 e envia para nuvem ou cache local mantendo marcadores na troca de versão.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManageUsers && (
                  <select
                    value={matUploadMode}
                    onChange={(e) => setMatUploadMode(e.target.value as 'local' | 'cloud')}
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="cloud">Destino: Nuvem (Firebase Storage)</option>
                    <option value="local">Destino: Local no navegador</option>
                  </select>
                )}
                <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {matUploadMode === 'cloud' && canManageUsers ? (
                    <CloudUpload className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                  )}
                  <span>{matSelectedFile ? matSelectedFile.name : 'Selecionar PDF'}</span>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => void handleLocalFilePick(e)}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  disabled={matInspecting}
                  onClick={() => void handleInspectUrlOrFile()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#0B3321] hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
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

            {cloudProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  <span>Enviando para o bucket Firebase Storage...</span>
                  <span className="tabular-nums">{cloudProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-emerald-700 transition-all"
                    style={{ width: `${cloudProgress}%` }}
                  />
                </div>
              </div>
            )}

            {(matPageCount !== undefined || matTextLayerStatus !== 'unknown' || matChecksumSha256) && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Páginas</p>
                  <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {matPageCount ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Tamanho</p>
                  <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {matFileSizeBytes ? formatBytes(matFileSizeBytes) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Camada de texto</p>
                  <p
                    className={`font-semibold ${
                      matTextLayerStatus === 'scanned'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {matTextLayerStatus === 'selectable'
                      ? 'Texto selecionável'
                      : matTextLayerStatus === 'scanned'
                        ? 'Digitalizado'
                        : matTextLayerStatus === 'mixed'
                          ? 'Misto'
                          : 'Não verificado'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Integridade SHA-256</p>
                  <p className="truncate font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    {matChecksumSha256 ? `${matChecksumSha256.slice(0, 12)}…` : '—'}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={matAllowDownload}
                    onChange={(e) => setMatAllowDownload(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span>Permitir download e abertura externa pelo estudante</span>
                </label>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Versão
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={matVersion}
                  onChange={(e) => setMatVersion(Math.max(1, Number(e.target.value) || 1))}
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Nota da versão
                </label>
                <input
                  value={matVersionNote}
                  onChange={(e) => setMatVersionNote(e.target.value)}
                  placeholder="Ex.: Retificação 02"
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <input
              value={matReviewNotes}
              onChange={(e) => setMatReviewNotes(e.target.value)}
              placeholder="Notas internas de revisão editorial (opcional — não exibidas ao aluno)"
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Workflow action buttons (all 5 PublicationStatus stages) */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onPreviewMaterial({
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
                })
              }
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Eye className="h-4 w-4" />
              Pré-visualizar
            </button>
            <button
              type="button"
              onClick={() => void handleSaveMaterial('draft')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Rascunho
            </button>
            <button
              type="button"
              onClick={() => void handleSaveMaterial('in_review')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
            >
              Em Revisão
            </button>
            <button
              type="button"
              onClick={() => void handleSaveMaterial('approved')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
            >
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => void handleSaveMaterial('published')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0B3321] px-4 text-xs font-semibold text-white hover:bg-[#146C43]"
            >
              <Send className="h-4 w-4" />
              {editingMatId ? 'Atualizar & Publicar' : 'Publicar'}
            </button>
            {editingMatId && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[42px] rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar Edição
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Orphan Cloud Storage objects detected */}
      {canManageUsers && orphanStorageObjects.length > 0 && (
        <SectionCard
          title="Arquivos Órfãos Detectados no Armazenamento"
          subtitle={`${orphanStorageObjects.length} arquivo(s) enviado(s) sem material vinculado no catálogo`}
        >
          <div className="space-y-2">
            {orphanStorageObjects.slice(0, 8).map((rec: StorageMetadataRecord) => (
              <div
                key={rec.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {rec.fileName}
                  </p>
                  <p className="truncate text-slate-500 dark:text-slate-400">
                    {formatBytes(rec.sizeBytes)} · {rec.category} · {rec.objectPath}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMatTitle(rec.fileName.replace(/\.[^.]+$/, ''));
                    setMatUrl(rec.downloadUrl);
                    setMatFileSizeBytes(rec.sizeBytes);
                    setMatChecksumSha256(rec.checksumSha256 || '');
                    setMatStorageProvider(rec.storageProvider);
                    setMatStoragePath(rec.objectPath);
                    setMatStorageMetaId(rec.id);
                    setMatCampusLevel(rec.campusLevel || 'superior');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#0B3321] px-3 font-semibold text-white hover:bg-[#146C43]"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Vincular ao Formulário
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Editorial Inventory */}
      <SectionCard
        title="Inventário Editorial de Materiais"
        subtitle={`${customMaterialsList.length} item(ns) no fluxo`}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar título/tópico..."
              className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="flex flex-wrap gap-1">
              {(['all', 'draft', 'in_review', 'approved', 'published', 'archived'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[34px] rounded-md border px-2 text-[11px] font-semibold ${
                    statusFilter === st
                      ? 'border-[#0B3321] bg-[#0B3321] text-white'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {st === 'all' ? 'Todos' : ADMIN_STATUS_BADGE[st].label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {customMaterialsList.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum material nesta categoria.
          </p>
        ) : (
          <div className="space-y-2.5">
            {customMaterialsList.map((m) => {
              const currentStatus: PublicationStatus = m.status || (m.isShared ? 'published' : 'draft');
              return (
                <div
                  key={m.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3.5 sm:flex-row sm:items-center dark:border-slate-800"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.resourceType === 'video' ? (
                        <Video className="h-4 w-4 shrink-0 text-rose-600" />
                      ) : m.resourceType === 'podcast' ? (
                        <Headphones className="h-4 w-4 shrink-0 text-emerald-700" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-[#0B3321] dark:text-emerald-400" />
                      )}
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {m.title}
                      </span>
                      {renderAdminStatusBadge(currentStatus)}
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {m.campusLevel || 'geral'} · {m.resourceType || m.fileType} · {m.institution || 'Acervo'}
                      {m.version ? ` · v${m.version}` : ''}
                      {m.pageCount ? ` · ${m.pageCount} págs.` : ''}
                      {m.checksumSha256 ? ` · SHA ${m.checksumSha256.slice(0, 8)}` : ''}
                      {m.allowDownload === false ? ' · Download restrito' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(m.fileType === 'pdf' || m.resourceType === 'livro_digital') && (
                      <button
                        type="button"
                        onClick={() => onOpenBookReader(m)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Book Reader
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPreviewMaterial(m)}
                      className="min-h-[36px] rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
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
                        setMatAuthor(m.author || '');
                        setMatEdition(m.edition || '');
                        setMatYear(m.year || 2026);
                        setMatKeywordsText((m.keywords || []).join(', '));
                        setMatAllowDownload(m.allowDownload !== false);
                        setMatTextLayerStatus(m.textLayerStatus || 'unknown');
                        setMatPageCount(m.pageCount);
                        setMatFileSizeBytes(m.fileSizeBytes);
                        setMatChecksumSha256(m.checksumSha256 || '');
                        setMatStorageProvider(m.storageProvider || 'external');
                        setMatStoragePath(m.storagePath || '');
                        setMatVersion(m.version || 1);
                        setMatVersionNote(m.versionNote || '');
                        setMatReviewNotes(m.reviewNotes || '');
                        setMatSelectedFile(null);
                        setMatInspectResult(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="min-h-[36px] rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      Editar / Versão
                    </button>
                    {currentStatus === 'in_review' && (
                      <button
                        type="button"
                        onClick={() => void updateMaterialStatus(m.id, 'approved')}
                        className="min-h-[36px] rounded-md bg-indigo-700 px-2.5 text-xs font-semibold text-white"
                      >
                        Aprovar
                      </button>
                    )}
                    {currentStatus !== 'published' && (
                      <button
                        type="button"
                        onClick={() => void updateMaterialStatus(m.id, 'published')}
                        className="min-h-[36px] rounded-md bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        Publicar
                      </button>
                    )}
                    {currentStatus === 'published' && (
                      <button
                        type="button"
                        onClick={() => void updateMaterialStatus(m.id, 'archived')}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Arquivar
                      </button>
                    )}
                    {currentStatus === 'archived' && (
                      <button
                        type="button"
                        onClick={() => void updateMaterialStatus(m.id, 'draft')}
                        className="min-h-[36px] rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        Reabrir
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
  );
}
