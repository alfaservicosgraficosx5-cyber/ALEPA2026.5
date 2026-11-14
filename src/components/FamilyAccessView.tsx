import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Monitor,
  Plus,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GERAL_LIBRARY_CATEGORIES } from '../data/alepaGeneralLibrary';
import { MEDIO_LIBRARY_CATEGORIES } from '../data/alepaMedioLibrary';
import { LIBRARY_CATEGORIES, RESOURCE_TYPE_META } from '../data/alepaQuestions';
import { getDisciplineShortName } from '../data/alepaSyllabus';
import { parseGoogleWorkspaceUrl } from '../lib/googleWorkspace';
import {
  AccessSession,
  CampusLevel,
  LibraryCategoryId,
  LibraryScope,
  MaterialFileType,
  NavSection,
  ResourceType,
} from '../types';

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object' && ts !== null) {
    const maybe = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
}

function isSameLocalDay(ms: number, nowMs: number): boolean {
  if (!ms) return false;
  const a = new Date(ms);
  const b = new Date(nowMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatLastSeen(ms: number, isOnlineFlag: boolean, nowMs: number): { label: string; activeNow: boolean } {
  if (!ms) return { label: 'Agora', activeNow: isOnlineFlag };
  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (isOnlineFlag && diffSec <= 180) {
    return { label: 'Online agora', activeNow: true };
  }
  if (diffSec < 60) return { label: 'Há menos de 1 min', activeNow: false };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { label: `Visto há ${diffMin} min`, activeNow: false };
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { label: `Visto há ${diffHours}h`, activeNow: false };
  return {
    label: new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    activeNow: false,
  };
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Início',
  materials: 'Conteúdo',
  disciplines: 'Disciplinas',
  schedule: 'Cronograma 2h',
  simulados: 'Simulados',
  revisions: 'Revisões',
  podcasts: 'Podcasts',
  videos: 'Vídeos',
  gemini: 'Gemini IA',
  performance: 'Desempenho',
  family: 'Familiares',
};

function inferTypeFromUrl(rawUrl: string): { fileType: MaterialFileType; resourceType: ResourceType } {
  const lower = rawUrl.toLowerCase();
  if (lower.includes('docs.google.com/spreadsheets') || /\.xlsx?($|\?)/i.test(lower)) {
    return { fileType: 'xlsx', resourceType: 'curso' };
  }
  if (lower.includes('docs.google.com/presentation') || /\.pptx?($|\?)/i.test(lower)) {
    return { fileType: 'pptx', resourceType: 'curso' };
  }
  if (lower.includes('drive.google.com')) {
    return { fileType: 'drive', resourceType: 'pdf' };
  }
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com')) {
    return { fileType: 'video', resourceType: 'video' };
  }
  return { fileType: 'pdf', resourceType: 'pdf' };
}

export function FamilyAccessView({
  campus,
  onNavigate,
  onOpenContent,
}: {
  campus: CampusLevel;
  onNavigate: (tab: NavSection) => void;
  onOpenContent: (scope: LibraryScope) => void;
}) {
  const {
    user,
    isGuest,
    profile,
    isAdmin,
    canPublishShared,
    myFamilyMembership,
    familyMembers,
    accessSessions,
    materials,
    addMaterial,
    deleteMaterial,
    inviteFamilyMember,
    toggleFamilyMemberPublish,
    toggleFamilyMemberActive,
    removeFamilyMember,
    exitGuestMode,
  } = useAuth();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 20000);
    return () => window.clearInterval(t);
  }, []);

  // Copy link feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Invite Family Member State (Admin)
  const [famName, setFamName] = useState('');
  const [famEmail, setFamEmail] = useState('');
  const [famRelation, setFamRelation] = useState('Familiar');
  const [famCanPublish, setFamCanPublish] = useState(true);
  const [famSaving, setFamSaving] = useState(false);
  const [famFeedback, setFamFeedback] = useState<string | null>(null);

  // Quick Teaching Content Form State
  const [matTitle, setMatTitle] = useState('');
  const [matScope, setMatScope] = useState<LibraryScope>(campus === 'medio' ? 'medio' : 'geral');
  const [matCategoryId, setMatCategoryId] = useState<LibraryCategoryId>(
    campus === 'medio' ? MEDIO_LIBRARY_CATEGORIES[0].id : GERAL_LIBRARY_CATEGORIES[0].id
  );
  const [matResourceType, setMatResourceType] = useState<ResourceType>('pdf');
  const [matFileType, setMatFileType] = useState<MaterialFileType>('drive');
  const [matUrl, setMatUrl] = useState('');
  const [matDescription, setMatDescription] = useState('');
  const [matShareWithFamily, setMatShareWithFamily] = useState<boolean>(true);
  const [matSaving, setMatSaving] = useState(false);
  const [matFeedback, setMatFeedback] = useState<string | null>(null);

  const scopeCategories = useMemo(() => {
    if (matScope === 'geral') return GERAL_LIBRARY_CATEGORIES;
    if (matScope === 'medio') return MEDIO_LIBRARY_CATEGORIES;
    return LIBRARY_CATEGORIES;
  }, [matScope]);

  const sortedSessions = useMemo(() => {
    return [...accessSessions].sort((a, b) => toMillis(b.lastSeenAt) - toMillis(a.lastSeenAt));
  }, [accessSessions]);

  const accessMetrics = useMemo(() => {
    const onlineUsers = new Set<string>();
    const todayUsers = new Set<string>();
    const allUsers = new Set<string>();
    let onlineDevices = 0;

    sortedSessions.forEach((s: AccessSession) => {
      const ms = toMillis(s.lastSeenAt);
      allUsers.add(s.userId);
      const isActiveNow = s.isOnline && (ms === 0 || nowMs - ms <= 180000);
      if (isActiveNow) {
        onlineUsers.add(s.userId);
        onlineDevices += 1;
      }
      if (isSameLocalDay(ms, nowMs)) {
        todayUsers.add(s.userId);
      }
    });

    return {
      onlinePeopleCount: onlineUsers.size,
      onlineDevicesCount: onlineDevices,
      todayPeopleCount: todayUsers.size,
      totalUniqueUsers: allUsers.size,
      totalSessionsCount: sortedSessions.length,
    };
  }, [sortedSessions, nowMs]);

  const familySharedMaterials = useMemo(() => {
    return materials.filter((m) => m.isShared && !m.isSystemDefault);
  }, [materials]);

  const myPersonalMaterials = useMemo(() => {
    const uid = user?.uid || profile?.uid;
    return materials.filter((m) => !m.isSystemDefault && m.ownerId === uid);
  }, [materials, user?.uid, profile?.uid]);

  const publicAppUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'https://ais-pre-ce7hmnmretsjplv6k3rggc-538369928080.us-west2.run.app';
    }
    return window.location.origin.replace('://ais-dev-', '://ais-pre-');
  }, []);

  const baseFamilyLoginUrl = useMemo(() => {
    return `${publicAppUrl}/?acesso=familiar`;
  }, [publicAppUrl]);

  const buildMemberInviteUrl = (email?: string) => {
    if (!email) return baseFamilyLoginUrl;
    return `${baseFamilyLoginUrl}&email=${encodeURIComponent(email.trim().toLowerCase())}`;
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2500);
    } catch {
      setCopiedKey(null);
    }
  };

  const handleAddFamilyMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFamSaving(true);
    setFamFeedback(null);
    try {
      await inviteFamilyMember({
        name: famName,
        email: famEmail,
        relationship: famRelation,
        canPublish: famCanPublish,
      });
      const addedEmail = famEmail.trim().toLowerCase();
      setFamName('');
      setFamEmail('');
      setFamFeedback(`Familiar autorizado (${addedEmail}). Envie o link de Acesso Familiar abaixo para ele entrar.`);
    } catch (err) {
      setFamFeedback(err instanceof Error ? err.message : 'Não foi possível adicionar o familiar.');
    } finally {
      setFamSaving(false);
    }
  };

  const handlePublishTeachingContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setMatSaving(true);
    setMatFeedback(null);
    try {
      const cleanUrl = matUrl.trim();
      if (!cleanUrl) {
        throw new Error('Cole o link do conteúdo (Google Drive, PDF, YouTube, Planilha ou Apresentação).');
      }
      const parsed = parseGoogleWorkspaceUrl(cleanUrl);
      const selectedCat = scopeCategories.find((c) => c.id === matCategoryId) || scopeCategories[0];

      await addMaterial({
        title: matTitle,
        disciplineId: selectedCat.disciplineId,
        libraryCategoryId: selectedCat.id,
        editalTopic: selectedCat.title,
        resourceType: matResourceType,
        fileType: matFileType,
        institution:
          matScope === 'geral'
            ? 'Ensino Familiar · Biblioteca Geral'
            : matScope === 'medio'
              ? 'Ensino Familiar · Nível Médio'
              : 'Ensino Familiar · Nível Superior',
        url: parsed.cleanUrl || cleanUrl,
        pricing: 'gratuito',
        linkStatus: 'ativo',
        isOfficialContent: false,
        description: matDescription,
        isShared: canPublishShared ? matShareWithFamily : false,
      });

      setMatTitle('');
      setMatUrl('');
      setMatDescription('');
      setMatFeedback(
        canPublishShared && matShareWithFamily
          ? 'Conteúdo de ensino publicado! Todos os familiares conectados já conseguem abrir.'
          : 'Conteúdo salvo na sua conta pessoal.'
      );
    } catch (err) {
      setMatFeedback(err instanceof Error ? err.message : 'Erro ao salvar conteúdo de ensino.');
    } finally {
      setMatSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            Área Compartilhada · Login de Familiares, Publicação de Ensino e Acessos
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
            Acesso por Familiares & Monitoramento
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenContent('geral')}
            className="min-h-[42px] px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4 text-[#146C43]" />
            <span>Abrir Aba Geral</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenContent(campus === 'medio' ? 'medio' : 'superior')}
            className="min-h-[42px] px-3.5 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Abrir Aba Conteúdo</span>
          </button>
        </div>
      </div>

      {/* Aviso se entrou como visitante sem nuvem */}
      {isGuest && !user && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-950">Você está no Modo Visitante (sem nuvem)</p>
            <p className="text-xs text-amber-900">
              Para acessar conteúdos enviados por familiares em tempo real, publicar aulas compartilhadas e contabilizar
              seu acesso na rede da família, entre com Google ou com sua conta familiar.
            </p>
          </div>
          <button
            type="button"
            onClick={exitGuestMode}
            className="min-h-[42px] px-4 py-2 bg-[#0B3321] text-white text-xs font-semibold rounded-xl whitespace-nowrap shrink-0"
          >
            Ir para Login Familiar
          </button>
        </section>
      )}

      {/* 1. QUANTAS PESSOAS ESTÃO ACESSANDO (LIVE PRESENCE COUNTER) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-[#146C43]">Monitoramento em Tempo Real</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Quantas pessoas estão acessando
            </h2>
          </div>

          <span
            className={`px-3 py-1 rounded-lg text-xs font-semibold w-fit ${
              isAdmin
                ? 'bg-emerald-50 text-[#0B3321] border border-emerald-200'
                : myFamilyMembership?.active
                  ? 'bg-emerald-50 text-[#0B3321] border border-emerald-200'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            {isAdmin
              ? 'Conta Admin / Publicador Principal'
              : myFamilyMembership?.active
                ? `Familiar Autorizado (${myFamilyMembership.relationship})`
                : user
                  ? 'Conta Conectada na Nuvem'
                  : 'Visitante Local'}
          </span>
        </div>

        {isAdmin ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-[#0B3321] text-white space-y-1">
                <p className="text-xs text-emerald-200">Acessando agora</p>
                <p className="font-mono text-2xl sm:text-3xl font-bold tabular-nums">
                  {accessMetrics.onlinePeopleCount}
                </p>
                <p className="text-[11px] text-emerald-100/90">
                  {accessMetrics.onlineDevicesCount}{' '}
                  {accessMetrics.onlineDevicesCount === 1 ? 'aparelho ativo' : 'aparelhos ativos'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-xs text-slate-600">Acessaram hoje</p>
                <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                  {accessMetrics.todayPeopleCount}
                </p>
                <p className="text-[11px] text-slate-500">Pessoas distintas hoje</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-xs text-slate-600">Total já conectado</p>
                <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                  {accessMetrics.totalUniqueUsers}
                </p>
                <p className="text-[11px] text-slate-500">
                  {accessMetrics.totalSessionsCount} {accessMetrics.totalSessionsCount === 1 ? 'dispositivo' : 'dispositivos'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-xs text-slate-600">Conteúdos da família</p>
                <p className="font-mono text-2xl sm:text-3xl font-bold text-[#0B3321] tabular-nums">
                  {familySharedMaterials.length}
                </p>
                <p className="text-[11px] text-slate-500">Publicados na nuvem</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <p className="text-xs font-semibold text-slate-700">
                Pessoas e aparelhos recentes ({sortedSessions.length})
              </p>

              {sortedSessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Nenhum acesso registrado ainda além desta sessão. Assim que um familiar entrar com o link abaixo, ele
                  aparecerá aqui automaticamente em tempo real.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {sortedSessions.map((sess) => {
                    const ms = toMillis(sess.lastSeenAt);
                    const status = formatLastSeen(ms, sess.isOnline, nowMs);
                    const tabName = TAB_LABELS[sess.currentTab] || sess.currentTab;
                    return (
                      <div
                        key={sess.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              status.activeNow
                                ? 'bg-emerald-100 text-[#0B3321]'
                                : 'bg-slate-200/80 text-slate-600'
                            }`}
                          >
                            {sess.deviceType === 'mobile' ? (
                              <Smartphone className="w-4 h-4" />
                            ) : (
                              <Monitor className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {sess.displayName}
                              {sess.userId === user?.uid ? ' (Você)' : ''}
                            </p>
                            <p className="text-[11px] text-slate-600 truncate">
                              {sess.deviceType === 'mobile' ? 'Celular' : 'Computador'} · Aba {tabName} ·{' '}
                              {sess.activeCampus === 'medio' ? 'Médio' : 'Superior'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          <p
                            className={`text-[11px] font-bold ${
                              status.activeNow ? 'text-[#146C43]' : 'text-slate-500'
                            }`}
                          >
                            {status.label}
                          </p>
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                            {sess.accessType}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
              <p className="text-xs font-semibold text-[#0B3321]">Sua conexão familiar</p>
              <p className="text-sm font-bold text-slate-900">
                {user ? 'Conectado e contabilizado em tempo real' : 'Sem conta conectada'}
              </p>
              <p className="text-xs text-slate-600">
                {user
                  ? `${familySharedMaterials.length} conteúdos de ensino compartilhados disponíveis para você abrir.`
                  : 'Entre com Google ou E-mail na tela de login para receber atualizações da família.'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <p className="text-xs font-semibold text-slate-700">Permissão para publicar conteúdos</p>
              <p className="text-sm font-bold text-slate-900">
                {canPublishShared ? 'Liberada para compartilhar com a família' : 'Acesso de leitura + anotações pessoais'}
              </p>
              <p className="text-xs text-slate-600">
                {canPublishShared
                  ? 'Você pode incluir links de ensino abaixo e todos os familiares verão.'
                  : 'Você pode abrir tudo o que for publicado e salvar seus próprios links pessoais.'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 2. ABA PARA COLOCAR CONTEÚDOS DE ENSINO */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-[#146C43]">Publicação Direta no Celular ou PC</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Colocar Conteúdo de Ensino para Familiares
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Cole o link do Google Drive, PDF online, vídeo aula, apresentação ou planilha para disponibilizar na aba{' '}
              <strong>Geral</strong> ou <strong>Conteúdo</strong> de todos os familiares.
            </p>
          </div>
        </div>

        <form onSubmit={handlePublishTeachingContent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título do conteúdo de ensino
              </label>
              <input
                type="text"
                required
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="Ex.: Apostila Direito Constitucional · Aula 01"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link do material (Google Drive, PDF, Vídeo, Planilha)
              </label>
              <input
                type="url"
                required
                value={matUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setMatUrl(val);
                  if (val.trim()) {
                    const inferred = inferTypeFromUrl(val);
                    setMatFileType(inferred.fileType);
                    setMatResourceType(inferred.resourceType);
                  }
                }}
                placeholder="https://drive.google.com/... ou https://..."
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Aba de destino</label>
              <select
                value={matScope}
                onChange={(e) => {
                  const next = e.target.value as LibraryScope;
                  setMatScope(next);
                  const list =
                    next === 'geral'
                      ? GERAL_LIBRARY_CATEGORIES
                      : next === 'medio'
                        ? MEDIO_LIBRARY_CATEGORIES
                        : LIBRARY_CATEGORIES;
                  setMatCategoryId(list[0].id);
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
              >
                <option value="geral">Aba Geral (Comum aos 2 níveis)</option>
                <option value="superior">Aba Conteúdo · Nível Superior</option>
                <option value="medio">Aba Conteúdo · Nível Médio</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Disciplina</label>
              <select
                value={matCategoryId}
                onChange={(e) => setMatCategoryId(e.target.value as LibraryCategoryId)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
              >
                {scopeCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {String(cat.order).padStart(2, '0')} · {cat.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de material</label>
              <select
                value={matResourceType}
                onChange={(e) => setMatResourceType(e.target.value as ResourceType)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
              >
                {RESOURCE_TYPE_META.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observação / instrução (opcional)</label>
            <input
              type="text"
              value={matDescription}
              onChange={(e) => setMatDescription(e.target.value)}
              placeholder="Ex.: Ler páginas 1 a 25 antes do simulado"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {canPublishShared ? (
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matShareWithFamily}
                  onChange={(e) => setMatShareWithFamily(e.target.checked)}
                />
                <span>Compartilhar com todos os familiares (visível nos celulares deles)</span>
              </label>
            ) : (
              <p className="text-xs text-slate-600">
                Salvo na sua biblioteca pessoal. Peça ao administrador para liberar publicação compartilhada no seu e-mail.
              </p>
            )}

            <button
              type="submit"
              disabled={matSaving}
              className="min-h-[44px] px-5 py-2 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{matSaving ? 'Publicando...' : 'Publicar conteúdo'}</span>
            </button>
          </div>
        </form>

        {matFeedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-950">
            {matFeedback}
          </div>
        )}

        {/* Lista rápida de conteúdos publicados para a família */}
        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Conteúdos compartilhados com familiares ({familySharedMaterials.length})
              {myPersonalMaterials.length > 0 && !isAdmin ? ` · Seus salvos (${myPersonalMaterials.length})` : ''}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('materials')}
              className="text-xs font-semibold text-[#0B3321] hover:underline"
            >
              Ver todos na Aba Conteúdo
            </button>
          </div>

          {familySharedMaterials.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum conteúdo extra compartilhado ainda. Use o formulário acima para publicar PDFs, pastas do Drive ou
              videoaulas para seus familiares.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {familySharedMaterials.map((mat) => {
                const canDelete = isAdmin || mat.ownerId === user?.uid;
                return (
                  <div
                    key={mat.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{mat.title}</p>
                      <p className="text-[11px] text-slate-600 truncate">
                        {getDisciplineShortName(mat.disciplineId)} · {mat.institution || 'Conteúdo Familiar'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={mat.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-2.5 py-1 bg-[#0B3321] text-white text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <span>Abrir</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteMaterial(mat.id)}
                          aria-label="Excluir conteúdo"
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 3. LINK DA ABA DE LOGIN PARA FAMILIARES + GERENCIAR FAMILIARES */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-[#146C43]">Convite & Controle de Acesso</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Aba de Login de Acesso por Familiares
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Envie este link para seus familiares entrarem direto na aba <strong>Familiares</strong> no celular ou PC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void copyText(baseFamilyLoginUrl, 'general')}
              className="min-h-[40px] px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedKey === 'general' ? <Check className="w-3.5 h-3.5 text-[#146C43]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'general' ? 'Link copiado!' : 'Copiar link familiar'}</span>
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Acesse a nossa área de estudos e conteúdos compartilhados no Concurso ALEPA 2026: ${baseFamilyLoginUrl}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-3.5 py-2 bg-[#146C43] hover:bg-[#0B3321] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar no WhatsApp</span>
            </a>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 break-all">
          {baseFamilyLoginUrl}
        </div>

        {/* Link Geral para Compartilhar pelo PC ou Celular */}
        <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#0B3321]">
                Link Principal para Compartilhar pelo PC ou Celular
              </p>
              <p className="text-[11px] text-slate-600">
                Abre a plataforma completa para estudar, instalar no celular ou fazer login na nuvem.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void copyText(publicAppUrl, 'public_app')}
                className="min-h-[36px] px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-[#0B3321] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                {copiedKey === 'public_app' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'public_app' ? 'Copiado!' : 'Copiar link geral'}</span>
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Acesse a plataforma de estudos Concurso ALEPA 2026 pelo PC ou celular: ${publicAppUrl}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] px-3 py-1.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-white border border-emerald-200 font-mono text-[11px] text-slate-800 break-all">
            {publicAppUrl}
          </div>
        </div>

        {isAdmin && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <form onSubmit={handleAddFamilyMember} className="space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#0B3321]" />
                <h3 className="text-sm font-bold text-slate-900">Autorizar Novo Familiar</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nome do familiar</label>
                  <input
                    type="text"
                    required
                    value={famName}
                    onChange={(e) => setFamName(e.target.value)}
                    placeholder="Ex.: Maria Silva"
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-mail de acesso (Google ou Login)</label>
                  <input
                    type="email"
                    required
                    value={famEmail}
                    onChange={(e) => setFamEmail(e.target.value)}
                    placeholder="familiar@gmail.com"
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Parentesco</label>
                  <select
                    value={famRelation}
                    onChange={(e) => setFamRelation(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="Familiar">Familiar</option>
                    <option value="Cônjuge">Cônjuge</option>
                    <option value="Irmão(ã)">Irmão(ã)</option>
                    <option value="Filho(a)">Filho(a)</option>
                    <option value="Pai/Mãe">Pai / Mãe</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs sm:text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={famCanPublish}
                    onChange={(e) => setFamCanPublish(e.target.checked)}
                  />
                  <span>Permitir que este familiar também publique conteúdos de ensino</span>
                </label>

                <button
                  type="submit"
                  disabled={famSaving}
                  className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{famSaving ? 'Salvando...' : 'Autorizar familiar'}</span>
                </button>
              </div>
            </form>

            {famFeedback && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-950">
                {famFeedback}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Familiares autorizados ({familyMembers.length})
              </p>

              {familyMembers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhum familiar cadastrado ainda. Adicione acima o e-mail de quem vai acessar ou colaborar com conteúdos.
                </p>
              ) : (
                <div className="space-y-2">
                  {familyMembers.map((member) => {
                    const memberInviteLink = buildMemberInviteUrl(member.email);
                    return (
                      <div
                        key={member.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Users className="w-4 h-4 text-[#0B3321] shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {member.name}{' '}
                              <span className="font-normal text-slate-500">· {member.relationship}</span>
                            </p>
                            <p className="text-xs text-slate-600 truncate">{member.email}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {member.active ? 'Acesso ativo' : 'Acesso pausado'} ·{' '}
                              {member.canPublish ? 'Pode publicar conteúdos' : 'Somente leitura'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void copyText(memberInviteLink, member.id)}
                            className="min-h-[34px] px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            {copiedKey === member.id ? (
                              <Check className="w-3 h-3 text-[#146C43]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedKey === member.id ? 'Copiado' : 'Link pessoal'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleFamilyMemberPublish(member.id, !member.canPublish)}
                            className={`min-h-[34px] px-2.5 py-1 border text-[11px] font-semibold rounded-lg whitespace-nowrap ${
                              member.canPublish
                                ? 'bg-emerald-50 border-emerald-200 text-[#0B3321]'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            {member.canPublish ? 'Publica: Sim' : 'Publica: Não'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleFamilyMemberActive(member.id, !member.active)}
                            className="min-h-[34px] px-2.5 py-1 bg-white border border-slate-200 text-slate-700 text-[11px] font-medium rounded-lg whitespace-nowrap"
                          >
                            {member.active ? 'Pausar' : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeFamilyMember(member.id)}
                            aria-label="Remover familiar"
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
