import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Headphones,
  Layers,
  Lightbulb,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isGeralMaterial } from '../data/alepaGeneralLibrary';
import {
  MEDIO_CARGOS,
  MEDIO_CONCURSO_PROFILE,
  getMedioCargoInfo,
  isMedioDisciplineId,
} from '../data/alepaMedioSyllabus';
import { MEDIO_QUESTIONS } from '../data/alepaMedioLibrary';
import {
  CONCURSO_PROFILE,
  formatDateKey,
  generateDailyPlanForDate,
  getDaysUntilExam,
} from '../data/alepaSyllabus';
import { StudyAlertSettings } from '../hooks/useStudyAlert';
import { CampusLevel, LibraryScope, MedioCargoGroup, NavSection, StudyMaterial, formatRoleLabel } from '../types';
import { loadLastStudiedContext } from '../utils/mediaUrls';
import { BookReaderModal } from './BookReaderModal';

interface DashboardViewProps {
  campus: CampusLevel;
  onChangeCampus: (campus: CampusLevel) => void;
  medioCargoGroup: MedioCargoGroup;
  onChangeMedioCargoGroup: (group: MedioCargoGroup) => void;
  onNavigate: (section: NavSection) => void;
  onOpenContent?: (scope: LibraryScope) => void;
  onOpenStudyRoom?: (disciplineId: string, topicId: string) => void;
  onStartFocusTimer: (disciplineId: string, topicTitle: string) => void;
  alertSettings: StudyAlertSettings;
}

function getCurrentWeekRange() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay(); // 0 = Sunday, 1 = Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmtBr = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  return {
    startKey: formatDateKey(monday),
    endKey: formatDateKey(sunday),
    label: `${fmtBr(monday)} – ${fmtBr(sunday)}`,
  };
}

export function DashboardView({
  campus,
  onChangeCampus,
  medioCargoGroup,
  onChangeMedioCargoGroup,
  onNavigate,
  onOpenContent,
  onOpenStudyRoom,
  onStartFocusTimer,
  alertSettings,
}: DashboardViewProps) {
  const {
    profile,
    effectiveRole,
    isAdmin,
    preferences,
    accessSessions,
    topicProgressMap,
    disciplineGoalsMap,
    readingProgressMap,
    saveDisciplineWeeklyGoal,
    studySessions,
    simuladoAttempts,
    errorNotebook,
    materials,
    questions,
    platformNotices,
    classes,
    lessons,
    activities,
    getCampusDisciplines,
  } = useAuth();

  const [readerMaterial, setReaderMaterial] = useState<StudyMaterial | null>(null);

  const hiddenCardsSet = React.useMemo(
    () => new Set(preferences.hiddenDashboardCards || []),
    [preferences.hiddenDashboardCards]
  );
  const isCardVisible = (cardId: string) => !hiddenCardsSet.has(cardId);
  const getCardOrderStyle = (cardId: string): React.CSSProperties | undefined => {
    const idx = preferences.dashboardCardOrder.indexOf(cardId);
    return idx >= 0 ? { order: idx } : undefined;
  };

  const latestReading = React.useMemo(() => {
    const entries = Object.values(readingProgressMap);
    if (entries.length === 0) return null;
    const sorted = [...entries].sort((a, b) => {
      const ta = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
      const tb = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
      return tb - ta;
    });
    for (const rp of sorted) {
      const mat = materials.find((m) => m.id === rp.materialId);
      if (mat) return { progress: rp, material: mat };
    }
    return null;
  }, [readingProgressMap, materials]);

  const onlineNowCount = React.useMemo(() => {
    const now = Date.now();
    const activeUids = new Set<string>();
    accessSessions.forEach((s) => {
      const rawTs = s.lastSeenAt as { toMillis?: () => number; seconds?: number } | number | Date | undefined;
      let ms = 0;
      if (typeof rawTs === 'number') ms = rawTs;
      else if (rawTs instanceof Date) ms = rawTs.getTime();
      else if (rawTs && typeof rawTs === 'object') {
        if (typeof rawTs.toMillis === 'function') ms = rawTs.toMillis();
        else if (typeof rawTs.seconds === 'number') ms = rawTs.seconds * 1000;
      }
      if (s.isOnline && (ms === 0 || now - ms <= 180000)) {
        activeUids.add(s.userId);
      }
    });
    return activeUids.size;
  }, [accessSessions]);

  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [savedGoalIds, setSavedGoalIds] = useState<Record<string, boolean>>({});
  const [goalFeedbackError, setGoalFeedbackError] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<'today' | 'progress' | 'goals'>('today');

  const isMedio = campus === 'medio';
  const todayKey = formatDateKey(new Date());
  const currentWeek = getCurrentWeekRange();
  const dailyGoal = profile?.dailyGoalMinutes || CONCURSO_PROFILE.dailyGoalMinutes;
  const minutesToday = studySessions
    .filter((s) => s.dateKey === todayKey)
    .reduce((acc, s) => acc + s.durationMinutes, 0);

  const dailyPct = Math.min(100, Math.round((minutesToday / dailyGoal) * 100));
  const daysUntilExam = getDaysUntilExam(profile?.examDate || CONCURSO_PROFILE.examDate);

  const activeDisciplines = getCampusDisciplines(campus, medioCargoGroup);

  // Campus-independent metrics (conteúdos, progresso, simulados e revisões separados)
  const campusSessions = studySessions.filter((s) =>
    isMedio ? isMedioDisciplineId(s.disciplineId) : !isMedioDisciplineId(s.disciplineId)
  );
  const campusAttempts = simuladoAttempts.filter((a) =>
    isMedio ? isMedioDisciplineId(a.primaryDisciplineId) : !isMedioDisciplineId(a.primaryDisciplineId)
  );
  const campusErrors = errorNotebook.filter((e) =>
    isMedio ? isMedioDisciplineId(e.disciplineId) : !isMedioDisciplineId(e.disciplineId)
  );
  const campusMaterials = materials.filter((m) => {
    if (m.campusLevel === 'geral' || isGeralMaterial(m)) return true;
    if (m.campusLevel === 'medio') return isMedio;
    if (m.campusLevel === 'superior') return !isMedio;
    const belongsToMedio =
      isMedioDisciplineId(m.disciplineId) || Boolean(m.libraryCategoryId?.startsWith('nm_cat_'));
    return isMedio ? belongsToMedio : !belongsToMedio;
  });
  const campusPodcastCount = campusMaterials.filter((m) => m.resourceType === 'podcast').length;
  const campusQuestionCount = questions.filter((q) =>
    isMedio ? isMedioDisciplineId(q.disciplineId) : !isMedioDisciplineId(q.disciplineId)
  ).length;
  const activeNotices = React.useMemo(() => {
    const priorityRank: Record<'urgente' | 'importante' | 'normal', number> = {
      urgente: 0,
      importante: 1,
      normal: 2,
    };
    return platformNotices
      .filter((n) => n.campusLevel === 'geral' || n.campusLevel === campus)
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
      .slice(0, 3);
  }, [platformNotices, campus]);

  const totalTopics = activeDisciplines.reduce((acc, d) => acc + d.topics.length, 0);
  const completedTopics = activeDisciplines.reduce(
    (acc, d) =>
      acc +
      d.topics.filter((t) => topicProgressMap[t.id]?.theoryDone && topicProgressMap[t.id]?.questionsDone).length,
    0
  );
  const syllabusPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const pendingErrors = campusErrors.filter((e) => e.status === 'pending').length;
  const overdueReviews = campusErrors.filter(
    (e) => e.status === 'pending' && e.nextReviewDate <= todayKey
  ).length;
  const latestAttempt = campusAttempts[0];
  const totalAnsweredSimulados = campusAttempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const totalCorrectSimulados = campusAttempts.reduce((sum, a) => sum + a.correctCount, 0);
  const accuracyPct =
    totalAnsweredSimulados > 0 ? Math.round((totalCorrectSimulados / totalAnsweredSimulados) * 100) : null;
  const lastStudied = React.useMemo(() => loadLastStudiedContext(), []);

  const dayIndex = Math.max(0, new Date().getDate() - 1);
  const todayPlan = generateDailyPlanForDate(new Date(), dayIndex, campus, medioCargoGroup);
  const currentBlock = todayPlan.blocks[0];

  const disciplineStats = activeDisciplines.map((disc) => {
    const topicIds = disc.topics.map((t) => t.id);
    const total = topicIds.length;
    const masterySum = topicIds.reduce((sum, id) => sum + (topicProgressMap[id]?.masteryLevel || 0), 0);
    const completed = topicIds.filter(
      (id) => topicProgressMap[id]?.theoryDone && topicProgressMap[id]?.questionsDone
    ).length;
    const avgPct = total > 0 ? Math.round(masterySum / total) : 0;
    const minutesLogged = campusSessions
      .filter((s) => s.disciplineId === disc.id)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    const weeklyMinutesLogged = campusSessions
      .filter(
        (s) =>
          s.disciplineId === disc.id &&
          s.dateKey >= currentWeek.startKey &&
          s.dateKey <= currentWeek.endKey
      )
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    const savedGoal = disciplineGoalsMap[disc.id];
    const suggestedWeeklyGoal = Math.max(30, disc.recommendedMinutesPerCycle * 2);
    const weeklyGoalMinutes = savedGoal?.weeklyGoalMinutes ?? suggestedWeeklyGoal;
    const hasCustomGoal = Boolean(savedGoal);
    const weeklyGoalRawPct =
      weeklyGoalMinutes > 0 ? Math.round((weeklyMinutesLogged / weeklyGoalMinutes) * 100) : 0;
    const weeklyGoalBarPct = Math.min(100, weeklyGoalRawPct);

    return {
      id: disc.id,
      rank: disc.priorityRank,
      shortName: disc.shortName,
      firstTopicId: disc.topics[0]?.id || '',
      firstTopicTitle: disc.topics[0]?.title || disc.shortName,
      editalBlock: disc.editalBlock,
      examQuestions: disc.examQuestions,
      examPoints: disc.examPoints,
      totalTopics: total,
      completedTopics: completed,
      avgPct,
      minutesLogged,
      weeklyMinutesLogged,
      weeklyGoalMinutes,
      hasCustomGoal,
      weeklyGoalRawPct,
      weeklyGoalBarPct,
    };
  });

  const handleSaveDisciplineGoal = async (discId: string, fallbackMinutes: number) => {
    const rawStr = goalDrafts[discId];
    const parsed = rawStr !== undefined ? Number(rawStr) : fallbackMinutes;
    if (!Number.isFinite(parsed) || parsed < 15) {
      setGoalFeedbackError('Informe uma meta semanal entre 15 e 2520 minutos.');
      return;
    }

    setGoalFeedbackError(null);
    setSavingGoalId(discId);
    try {
      const clamped = Math.max(15, Math.min(2520, Math.round(parsed)));
      await saveDisciplineWeeklyGoal(discId, clamped);
      setGoalDrafts((prev) => {
        const copy = { ...prev };
        delete copy[discId];
        return copy;
      });
      setSavedGoalIds((prev) => ({ ...prev, [discId]: true }));
      window.setTimeout(() => {
        setSavedGoalIds((prev) => ({ ...prev, [discId]: false }));
      }, 2200);
    } catch (err) {
      setGoalFeedbackError(err instanceof Error ? err.message : 'Não foi possível salvar a meta.');
    } finally {
      setSavingGoalId(null);
    }
  };

  const totalWeeklyStudiedMinutes = disciplineStats.reduce((sum, d) => sum + d.weeklyMinutesLogged, 0);
  const totalWeeklyTargetMinutes = disciplineStats.reduce((sum, d) => sum + d.weeklyGoalMinutes, 0);
  const overallWeeklyGoalPct =
    totalWeeklyTargetMinutes > 0
      ? Math.round((totalWeeklyStudiedMinutes / totalWeeklyTargetMinutes) * 100)
      : 0;

  const overallMasteryPct =
    disciplineStats.length > 0
      ? Math.round(disciplineStats.reduce((sum, d) => sum + d.avgPct, 0) / disciplineStats.length)
      : 0;
  const totalLoggedMinutesCampus = campusSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const activeMedioCargo = getMedioCargoInfo(medioCargoGroup);
  const activeMedioCargoLabel = `${activeMedioCargo.cargoNumber} – ${activeMedioCargo.title} (${activeMedioCargo.code})`;

  const navigationCards: Array<{
    id: NavSection;
    title: string;
    subtitle: string;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'disciplines',
      title: isMedio
        ? `Conteúdo Programático (${activeDisciplines.length} Disciplinas)`
        : 'Conteúdo Programático (Nível Superior)',
      subtitle: isMedio
        ? `Anexo II oficial – ${activeMedioCargo.cargoNumber} (${activeMedioCargo.code}) e demais cargos de Nível Médio.`
        : 'Anexo II oficial – Cargo 03 (Técnico Legislativo · PL.AL.102).',
      metric: `${completedTopics}/${totalTopics} tópicos · ${syllabusPct}%`,
      icon: BookOpen,
    },
    {
      id: 'materials',
      title: 'Biblioteca Geral + Específicas & Drive',
      subtitle: isMedio
        ? `Biblioteca Geral (comuns aos 2 níveis) + Acervo específico do Nível Médio (${activeMedioCargo.cargoNumber}), Drive, Planilhas e Slides.`
        : 'Biblioteca Geral (comuns aos 2 níveis) + Acervo específico do Nível Superior (Cargo 03), Drive, Planilhas e Slides.',
      metric: `${campusMaterials.length} recursos · 8 tipos`,
      icon: FileText,
    },
    {
      id: 'podcasts',
      title: 'Podcasts & Spotify por Disciplina',
      subtitle: isMedio
        ? `Conexão com Spotify e links de áudio para as ${activeDisciplines.length} matérias do ${activeMedioCargo.cargoNumber} (${activeMedioCargo.code}).`
        : 'Conexão com Spotify, playlists de foco e links de áudio para o Cargo 03 (PL.AL.102).',
      metric: `${campusPodcastCount} ${campusPodcastCount === 1 ? 'podcast' : 'podcasts'}`,
      icon: Headphones,
    },
    {
      id: 'simulados',
      title: 'Questões e Simulados CETAP',
      subtitle: isMedio
        ? `Banco independente de questões e simulados para Nível Médio (${activeMedioCargo.cargoNumber}).`
        : 'Banco independente de questões e simulados para Nível Superior (Cargo 03).',
      metric: latestAttempt
        ? `Último: ${latestAttempt.score.toFixed(1)}/10`
        : `${isMedio ? Math.max(campusQuestionCount, MEDIO_QUESTIONS.length) : campusQuestionCount} questões`,
      icon: ClipboardList,
    },
    {
      id: 'schedule',
      title: 'Cronograma Diário até 13/12/2026',
      subtitle: 'Plano 2h/dia, Anexo III oficial (Edital 001/2026) e alertas WhatsApp/E-mail.',
      metric: `${minutesToday}/${dailyGoal} min hoje`,
      icon: CalendarCheck,
    },
    {
      id: 'performance',
      title: 'Desempenho & Caderno de Erros',
      subtitle: isMedio
        ? 'Métricas, horas e revisão espaçada isoladas do Nível Médio.'
        : 'Métricas, horas e revisão espaçada isoladas do Nível Superior.',
      metric: `${pendingErrors} revisões · ${campusAttempts.length} simulados`,
      icon: TrendingUp,
    },
  ];

  const quickShortcuts = [
    {
      id: 'materials-geral',
      label: 'Aba Geral',
      subtitle: 'Matérias comuns aos 2 níveis',
      metric: 'Comuns',
      icon: BookOpen,
      onClick: () => (onOpenContent ? onOpenContent('geral') : onNavigate('materials')),
    },
    {
      id: 'materials-content',
      label: 'Conteúdo (PDF, Vídeo, Podcast)',
      subtitle: `${activeDisciplines.length} disciplinas · cadastrar e abrir`,
      metric: `${campusMaterials.length} itens`,
      icon: FileText,
      onClick: () =>
        onOpenContent ? onOpenContent(isMedio ? 'medio' : 'superior') : onNavigate('materials'),
    },
    {
      id: 'schedule',
      label: 'Cronograma 14/11 a 05/12',
      subtitle: 'Plano 2h/dia, timer e Anexo III',
      metric: `${minutesToday}/${dailyGoal}m`,
      icon: CalendarCheck,
      onClick: () => onNavigate('schedule'),
    },
    {
      id: 'simulados',
      label: 'Questões e Simulados CETAP',
      subtitle: isMedio ? `Nível Médio (${activeMedioCargo.cargoNumber})` : 'Nível Superior (Cargo 03)',
      metric: latestAttempt
        ? `${latestAttempt.score.toFixed(1)}/10`
        : `${isMedio ? Math.max(campusQuestionCount, MEDIO_QUESTIONS.length) : campusQuestionCount} q.`,
      icon: ClipboardList,
      onClick: () => onNavigate('simulados'),
    },
    {
      id: 'podcasts',
      label: 'Podcasts & Spotify',
      subtitle: 'Playlists e episódios por disciplina',
      metric: `${campusPodcastCount} áudios`,
      icon: Headphones,
      onClick: () => onNavigate('podcasts'),
    },
    {
      id: 'videos',
      label: 'Vídeos & Aulas',
      subtitle: 'YouTube, Instagram e TikTok',
      metric: 'Assistir',
      icon: Video,
      onClick: () => onNavigate('videos'),
    },
    {
      id: 'gemini',
      label: 'Gemini IA · Resumos',
      subtitle: 'Resumir vídeos, links e PDFs',
      metric: 'IA',
      icon: Sparkles,
      onClick: () => onNavigate('gemini'),
    },
    {
      id: 'disciplines',
      label: 'Edital e Tópicos',
      subtitle: `Checklist de ${activeDisciplines.length} disciplinas`,
      metric: `${syllabusPct}%`,
      icon: GraduationCap,
      onClick: () => onNavigate('disciplines'),
    },
    {
      id: 'revisions',
      label: 'Caderno de Erros & Revisões',
      subtitle: 'Revisão espaçada das questões',
      metric: `${pendingErrors} pend.`,
      icon: TrendingUp,
      onClick: () => onNavigate('revisions'),
    },
    {
      id: 'family',
      label: 'Acesso por Familiares',
      subtitle: isAdmin
        ? `${onlineNowCount} ${onlineNowCount === 1 ? 'pessoa online' : 'pessoas online'}`
        : 'Link compartilhado PC/celular',
      metric: 'Compartilhar',
      icon: Users,
      onClick: () => onNavigate('family'),
    },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Compact Header & Segmented Campus Switcher */}
      <section className="space-y-3" style={{ order: -2 }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-semibold text-[#146C43] dark:text-emerald-400">
              Meu Campus ALEPA · Fundação CETAP
            </p>
            <h1 className="font-display text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {isMedio ? `Nível Médio · ${activeMedioCargo.code}` : 'Nível Superior · PL.AL.102'}
            </h1>
          </div>
          <a
            href={MEDIO_CONCURSO_PROFILE.editalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#0B3321] dark:text-emerald-300 hover:border-[#0B3321] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>CETAP</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Segmented Campus Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/75 dark:bg-slate-800 rounded-2xl">
          <button
            type="button"
            onClick={() => onChangeCampus('superior')}
            className={`min-h-[48px] px-3 py-2 rounded-xl text-left transition-all flex items-center gap-2.5 ${
              campus === 'superior'
                ? 'bg-[#0B3321] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <GraduationCap
              className={`w-5 h-5 shrink-0 ${campus === 'superior' ? 'text-emerald-300' : 'text-[#146C43] dark:text-emerald-400'}`}
            />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold truncate">Nível Superior</p>
              <p
                className={`text-[10px] sm:text-xs font-mono truncate ${
                  campus === 'superior' ? 'text-emerald-200' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Cargo 03 · PL.AL.102
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeCampus('medio');
              onChangeMedioCargoGroup('cargo_01_04');
            }}
            className={`min-h-[48px] px-3 py-2 rounded-xl text-left transition-all flex items-center gap-2.5 ${
              campus === 'medio'
                ? 'bg-[#0B3321] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <Layers
              className={`w-5 h-5 shrink-0 ${campus === 'medio' ? 'text-emerald-300' : 'text-[#146C43] dark:text-emerald-400'}`}
            />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold truncate">Nível Médio</p>
              <p
                className={`text-[10px] sm:text-xs font-mono truncate ${
                  campus === 'medio' ? 'text-emerald-200' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Cargo 04 · PL.AL.060
              </p>
            </div>
          </button>
        </div>

        {/* Sub-selector de cargos Nível Médio */}
        {isMedio && (
          <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5">
            {MEDIO_CARGOS.map((cargo) => {
              const selected = medioCargoGroup === cargo.group;
              return (
                <button
                  key={cargo.code}
                  type="button"
                  onClick={() => onChangeMedioCargoGroup(cargo.group)}
                  className={`snap-start min-w-[205px] sm:min-w-0 shrink-0 text-left p-2.5 sm:p-3 rounded-xl border text-xs transition-colors ${
                    selected
                      ? 'border-[#146C43] bg-emerald-50 dark:bg-emerald-950/60 text-slate-900 dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <p className="font-mono font-bold text-[#0B3321] dark:text-emerald-300">
                    {cargo.cargoNumber} · {cargo.code}
                  </p>
                  <p className="font-semibold truncate mt-0.5">{cargo.shortTitle.replace(/^Cargo \d+ · /, '')}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Campus Deep Forest Green Hero Card with Instant Action */}
      {isCardVisible('hero') && (
      <section className="bg-[#0B3321] text-white rounded-2xl p-4 sm:p-7 space-y-4" style={getCardOrderStyle('hero')}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-emerald-300">
              {isMedio
                ? `${MEDIO_CONCURSO_PROFILE.editalNumber} · ${activeMedioCargo.cargoNumber}`
                : `${CONCURSO_PROFILE.editalNumber} · Cargo 03`}{' '}
              · {formatRoleLabel(effectiveRole)}
            </p>
            <h2 className="font-display text-xl sm:text-3xl font-bold text-white leading-tight">
              {isMedio
                ? `ALEPA 2026 – Nível Médio (${activeMedioCargo.code})`
                : 'ALEPA 2026 – Nível Superior (PL.AL.102)'}
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/85 truncate">
              {isMedio
                ? `${activeMedioCargoLabel} · R$ 2.295,22`
                : `Assessoramento Legislativo – Técnico Legislativo (${CONCURSO_PROFILE.code})`}
            </p>
          </div>
          <div className="text-right shrink-0 bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <p className="font-mono text-lg sm:text-2xl font-bold text-white tabular-nums leading-none">
              D-{daysUntilExam}
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-200 mt-1">13/12/2026</p>
          </div>
        </div>

        {/* Today's progress bar inside Hero */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-emerald-100">
            <span>Meta de hoje: {minutesToday} / {dailyGoal} min</span>
            <span className="font-bold text-emerald-300">{dailyPct}% · Edital {syllabusPct}%</span>
          </div>
          <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${dailyPct}%` }}
            />
          </div>
        </div>

        {/* Primary Thumb-Friendly CTA directly in Hero */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onStartFocusTimer(currentBlock.disciplineId, currentBlock.topicTitle)}
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 bg-white hover:bg-emerald-50 text-[#0B3321] text-sm font-bold rounded-xl transition-transform active:scale-[0.98] inline-flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span className="truncate">Iniciar bloco de hoje · {currentBlock.disciplineName}</span>
          </button>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            {onOpenStudyRoom && currentBlock.disciplineId && (
              <button
                type="button"
                onClick={() => {
                  const matchedDisc = activeDisciplines.find((d) => d.id === currentBlock.disciplineId) || activeDisciplines[0];
                  const firstTopic = matchedDisc?.topics[0];
                  if (matchedDisc && firstTopic) {
                    onOpenStudyRoom(matchedDisc.id, firstTopic.id);
                  } else {
                    onNavigate('study_room');
                  }
                }}
                className="min-h-[42px] px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-300/30 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5"
              >
                <BookOpen className="w-4 h-4 text-emerald-300 shrink-0" />
                <span className="truncate">Sala de Estudo</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="min-h-[42px] px-3.5 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5"
            >
              <CalendarCheck className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="truncate">Cronograma</span>
            </button>
          </div>
        </div>
      </section>
      )}

      {/* Compact Real-Data KPI Row (2x2 on phone, 4 cols on tablet/desktop) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3" style={{ order: -1 }}>
        <div className="campus-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Progresso do edital</p>
          <p className="font-display text-xl sm:text-2xl font-bold font-mono tabular-nums text-[#0B3321] dark:text-emerald-300 mt-0.5">
            {syllabusPct}%
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
            {completedTopics}/{totalTopics} tópicos concluídos
          </p>
        </div>

        <div className="campus-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tempo & Meta hoje</p>
          <p className="font-display text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
            {minutesToday}m <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/ {dailyGoal}m</span>
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
            {(totalLoggedMinutesCampus / 60).toFixed(1)}h acumuladas no campus
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('simulados')}
          className="campus-card text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#0B3321] rounded-2xl p-3.5 sm:p-4 transition-colors"
        >
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Questões & Taxa</p>
          <p className="font-display text-xl sm:text-2xl font-bold font-mono tabular-nums text-[#146C43] dark:text-emerald-400 mt-0.5">
            {accuracyPct !== null ? `${accuracyPct}%` : `${campusQuestionCount} q.`}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
            {accuracyPct !== null
              ? `${totalCorrectSimulados}/${totalAnsweredSimulados} acertos em simulados`
              : 'Banco CETAP disponível'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('revisions')}
          className="campus-card text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#0B3321] rounded-2xl p-3.5 sm:p-4 transition-colors"
        >
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Revisões agendadas</p>
          <p
            className={`font-display text-xl sm:text-2xl font-bold font-mono tabular-nums mt-0.5 ${
              overdueReviews > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {overdueReviews} <span className="text-xs font-sans font-semibold">hoje</span>
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
            {pendingErrors} pendentes no Caderno
          </p>
        </button>
      </section>

      {/* Continuar leitura no Book Reader (PDF) */}
      {isCardVisible('continue_reading') && latestReading && (
        <section
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={getCardOrderStyle('continue_reading')}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#E8F3EC] dark:bg-emerald-950/60 text-[#0B3321] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#146C43] dark:text-emerald-400 uppercase tracking-wider">
                Continuar leitura · Book Reader
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {latestReading.material.title}
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                Página {latestReading.progress.lastPage} de {latestReading.progress.totalPages || '?'} ·{' '}
                {latestReading.progress.progressPercent}% · {latestReading.progress.bookmarks.length} marcadores ·{' '}
                {latestReading.progress.annotations.length} notas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReaderMaterial(latestReading.material)}
            className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#146C43] text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-4 h-4" />
            <span>Abrir página {latestReading.progress.lastPage}</span>
          </button>
        </section>
      )}

      {/* Turmas, Aulas & Atividades do Estudante */}
      {isCardVisible('classroom_feed') && (
        <section
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={getCardOrderStyle('classroom_feed')}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#E8F3EC] dark:bg-emerald-950/60 text-[#0B3321] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#146C43] dark:text-emerald-400 uppercase tracking-wider">
                Minhas Turmas & Aulas
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {classes.filter((c) => c.campusLevel === campus).length} turmas ativas ·{' '}
                {lessons.filter((l) => l.campusLevel === campus).length} aulas ·{' '}
                {activities.filter((a) => a.campusLevel === campus).length} atividades
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Acesse roteiros docentes, responda questões avaliativas e acompanhe correções.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('classroom')}
            className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#146C43] text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Acessar turmas</span>
          </button>
        </section>
      )}

      {/* Avisos Publicados pela Coordenação */}
      {isCardVisible('notices') && activeNotices.length > 0 && (
        <section className="space-y-2.5" aria-label="Avisos publicados" style={getCardOrderStyle('notices')}>
          {activeNotices.map((notice) => (
            <div
              key={notice.id}
              className={`rounded-2xl border p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                notice.priority === 'urgente'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                  : notice.priority === 'importante'
                    ? 'bg-[#E8F3EC] dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-[#0B3321] dark:text-emerald-200'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                  <Bell className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {notice.priority === 'urgente'
                      ? 'Aviso Urgente'
                      : notice.priority === 'importante'
                        ? 'Comunicado Importante'
                        : 'Aviso do Campus'}
                  </span>
                  {notice.eventDate && (
                    <span className="font-mono font-semibold">
                      · {notice.eventDate.split('-').reverse().join('/')}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold">{notice.title}</p>
                <p className="text-xs opacity-90 leading-relaxed">{notice.body}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('schedule')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900/80 hover:bg-white border border-black/10 dark:border-white/10 text-xs font-semibold shrink-0 self-start sm:self-center"
              >
                Ver cronograma
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Continuar de onde parei (when user has recent study context) */}
      {lastStudied && (
        <section className="bg-[#E8F3EC] dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0B3321] text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#146C43] dark:text-emerald-400 uppercase tracking-wider">
                Continuar de onde parei
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{lastStudied.label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (lastStudied.disciplineId && lastStudied.topicId && onOpenStudyRoom) {
                onOpenStudyRoom(lastStudied.disciplineId, lastStudied.topicId);
              } else {
                onNavigate(lastStudied.section);
              }
            }}
            className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retomar estudo</span>
          </button>
        </section>
      )}

      {/* Mobile Interactive Section Switcher */}
      <div className="md:hidden grid grid-cols-3 gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-2xl">
        {(
          [
            { id: 'today', label: 'Hoje & Acesso' },
            { id: 'progress', label: 'Progresso' },
            { id: 'goals', label: 'Metas' },
          ] as const
        ).map((tab) => {
          const active = mobileSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileSection(tab.id)}
              className={`min-h-[42px] px-2 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                active
                  ? 'bg-white dark:bg-slate-900 text-[#0B3321] dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION 1: Hoje & Acesso Rápido */}
      <div
        className={`${mobileSection === 'today' ? 'block' : 'hidden'} md:block space-y-5`}
        style={getCardOrderStyle('study_today')}
      >
        {isCardVisible('study_today') && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-[#146C43] dark:text-emerald-400">
                Plano de hoje · 4 blocos (2h)
              </p>
              <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Toque em um bloco para iniciar o timer
              </h3>
            </div>
            <span className="font-mono text-xs font-semibold text-[#0B3321] dark:text-emerald-300 tabular-nums shrink-0">
              {minutesToday}/{dailyGoal}m
            </span>
          </div>

          <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
            {todayPlan.blocks.map((block) => (
              <button
                key={block.order}
                type="button"
                onClick={() => onStartFocusTimer(block.disciplineId, block.topicTitle)}
                className="snap-start min-w-[185px] sm:min-w-0 shrink-0 text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 hover:border-[#0B3321] hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span className="font-semibold text-[#146C43] dark:text-emerald-400">
                    0{block.order}. {block.label.split(' ')[0]}
                  </span>
                  <span>{block.durationMinutes}m</span>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-1">
                  {block.disciplineName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{block.topicTitle}</p>
              </button>
            ))}
          </div>
        </section>
        )}

        {/* Mobile Clean Interactive Action List (< md) */}
        {isCardVisible('quick_actions') && (
        <section className="md:hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {quickShortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="w-full min-h-[60px] px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-[#146C43] dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{item.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-[11px] font-semibold text-[#0B3321] dark:text-emerald-300">
                    {item.metric}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>
            );
          })}
        </section>
        )}

        {/* Desktop Rich Quick Bar + 2-Column Module Cards */}
        {isCardVisible('quick_actions') && (
        <div className="hidden md:block space-y-5">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
            <button
              type="button"
              onClick={() => (onOpenContent ? onOpenContent('geral') : onNavigate('materials'))}
              className="min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-[#0B3321] hover:bg-emerald-50/50 text-left transition-colors"
            >
              <p className="text-xs font-bold text-[#0B3321] truncate">Aba Geral</p>
              <p className="text-[11px] text-slate-600 truncate">Matérias comuns</p>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenContent ? onOpenContent(isMedio ? 'medio' : 'superior') : onNavigate('materials')
              }
              className="min-h-[46px] px-3 py-2 rounded-xl border border-[#0B3321] bg-[#0B3321] hover:bg-[#134b32] text-white text-left transition-colors"
            >
              <p className="text-xs font-bold truncate">Aba Conteúdo</p>
              <p className="text-[11px] text-emerald-200 truncate">{activeDisciplines.length} disciplinas</p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('videos')}
              className="min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-[#0B3321] hover:bg-emerald-50/50 text-left transition-colors"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-slate-900 truncate">Vídeos</p>
                <Video className="w-3.5 h-3.5 text-[#146C43] shrink-0" />
              </div>
              <p className="text-[11px] text-slate-600 truncate">YouTube, IG, TikTok</p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('gemini')}
              className="min-h-[46px] px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:border-[#0B3321] text-left transition-colors"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-[#0B3321] truncate">Gemini IA</p>
                <Sparkles className="w-3.5 h-3.5 text-[#146C43] shrink-0" />
              </div>
              <p className="text-[11px] text-[#146C43] font-medium truncate">Resumir Vídeo & PDF</p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('disciplines')}
              className="min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-[#0B3321] hover:bg-emerald-50/50 text-left transition-colors"
            >
              <p className="text-xs font-bold text-slate-900 truncate">Edital & Tópicos</p>
              <p className="text-[11px] text-slate-600 truncate">{syllabusPct}% concluído</p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('family')}
              className="min-h-[46px] px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:border-[#0B3321] text-left transition-colors"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-[#0B3321] truncate">Familiares</p>
                <Users className="w-3.5 h-3.5 text-[#146C43] shrink-0" />
              </div>
              <p className="text-[11px] text-[#146C43] font-medium truncate">
                {isAdmin
                  ? `${onlineNowCount} ${onlineNowCount === 1 ? 'pessoa online' : 'pessoas online'}`
                  : 'Acesso e conteúdos'}
              </p>
            </button>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {navigationCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onNavigate(card.id)}
                  className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-700/50 rounded-2xl p-5 transition-colors flex flex-col justify-between gap-3 min-h-[118px]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="w-5 h-5 text-[#146C43] dark:text-emerald-400" />
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {card.metric}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">{card.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{card.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </section>
        </div>
        )}

        {/* Dica do Dia & Alerta de Estudos */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-2">
            <div className="flex items-center gap-2 text-[#146C43] dark:text-emerald-400">
              <Lightbulb className="w-4 h-4" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Dica de estudo de hoje
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{todayPlan.studyTip}</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Bell className="w-4 h-4" />
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Alerta de estudos
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {alertSettings.enabled ? `Ativo · ${alertSettings.reminderTime}` : 'Desativado'}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{todayPlan.alertFocus}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('schedule')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-xs font-semibold text-[#0B3321] dark:text-emerald-300 hover:bg-emerald-100"
              >
                Configurar alerta e cronograma
              </button>
              <button
                type="button"
                onClick={() => onNavigate('revisions')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Caderno de Erros
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* SECTION 2: Gráfico de Progressão por Disciplina */}
      {isCardVisible('disciplines_overview') && (
        <section
          className={`${mobileSection === 'progress' ? 'block' : 'hidden'} md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5`}
          style={getCardOrderStyle('disciplines_overview')}
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-[#146C43] dark:text-emerald-400">
                Acompanhamento Independente ·{' '}
                {isMedio
                  ? `Nível Médio · ${activeMedioCargo.cargoNumber} (${activeMedioCargo.code}) – ${activeDisciplines.length} Disciplinas`
                  : 'Nível Superior · Cargo 03 (PL.AL.102)'}
              </p>
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                Gráfico de Progressão por Disciplina
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <span>
                Domínio: <strong className="text-[#0B3321] dark:text-emerald-300">{overallMasteryPct}%</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Tópicos:{' '}
                <strong className="text-[#0B3321] dark:text-emerald-300">
                  {completedTopics}/{totalTopics}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Horas:{' '}
                <strong className="text-[#0B3321] dark:text-emerald-300">
                  {(totalLoggedMinutesCampus / 60).toFixed(1)}h
                </strong>
              </span>
            </div>
          </div>

          <div className="flex sm:grid sm:grid-cols-5 gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
            {[
              { label: 'Conhec. Específicos', q: '20 questões', pts: '4,0 pts · 1º desemp.' },
              { label: 'Legislação e Ética', q: '10 questões', pts: '2,0 pts · 2º desemp.' },
              { label: 'Língua Portuguesa', q: '10 questões', pts: '2,0 pts · 3º desemp.' },
              { label: 'Raciocínio Lógico', q: '05 questões', pts: '1,0 pt · 4º desemp.' },
              { label: 'Informática', q: '05 questões', pts: '1,0 pt · 5º desemp.' },
            ].map((blk) => (
              <div
                key={blk.label}
                className="snap-start min-w-[155px] sm:min-w-0 shrink-0 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700"
              >
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate">{blk.label}</p>
                <p className="font-display text-sm font-bold text-[#0B3321] dark:text-emerald-300 font-mono tabular-nums mt-0.5">
                  {blk.q}
                </p>
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">{blk.pts}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3.5" role="region" aria-label="Gráfico de barras de progressão por disciplina">
            {disciplineStats.map((stat) => (
              <div key={stat.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenStudyRoom && stat.firstTopicId
                        ? onOpenStudyRoom(stat.id, stat.firstTopicId)
                        : onNavigate('disciplines')
                    }
                    className="font-semibold text-slate-900 dark:text-slate-100 hover:text-[#146C43] dark:hover:text-emerald-300 transition-colors text-left"
                  >
                    <span className="font-mono text-slate-500 dark:text-slate-400 mr-1.5">
                      {String(stat.rank).padStart(2, '0')}.
                    </span>
                    {stat.shortName}
                  </button>

                  <div className="flex items-center gap-2 sm:gap-3 font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    <span className="text-[#0B3321] dark:text-emerald-300 font-medium">{stat.examQuestions}q</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {stat.completedTopics}/{stat.totalTopics}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{stat.minutesLogged}m</span>
                    <span className="font-bold text-[#0B3321] dark:text-emerald-300 w-9 text-right">
                      {stat.avgPct}%
                    </span>
                  </div>
                </div>

                <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${stat.avgPct > 0 ? Math.max(4, stat.avgPct) : 0}%`,
                      backgroundColor: stat.avgPct >= 75 ? '#0B3321' : '#146C43',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Teoria (40%), Questões (40%) e Revisão (20%) por tópico.</span>
            <button
              type="button"
              onClick={() => onNavigate('disciplines')}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-xs font-semibold text-[#0B3321] dark:text-emerald-300 hover:bg-emerald-100 whitespace-nowrap"
            >
              Atualizar checklist das disciplinas
            </button>
          </div>
        </section>
      )}

      {/* SECTION 3: Metas Semanais por Disciplina */}
      {isCardVisible('disciplines_overview') && (
        <section
          className={`${mobileSection === 'goals' ? 'block' : 'hidden'} md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5`}
          style={getCardOrderStyle('disciplines_overview')}
        >
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-[#146C43] dark:text-emerald-400">
                <Target className="w-4 h-4" />
                <p className="text-xs font-semibold">
                  Semana Atual ({currentWeek.label}) ·{' '}
                  {isMedio ? `Nível Médio (${activeMedioCargo.code})` : 'Nível Superior (PL.AL.102)'}
                </p>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                Metas Semanais por Disciplina
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Defina quantos minutos deseja estudar por semana em cada matéria e acompanhe seu tempo real.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <span>
                Estudado: <strong className="text-[#0B3321] dark:text-emerald-300">{totalWeeklyStudiedMinutes}m</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Meta: <strong className="text-[#0B3321] dark:text-emerald-300">{totalWeeklyTargetMinutes}m</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Cumprimento: <strong className="text-[#0B3321] dark:text-emerald-300">{overallWeeklyGoalPct}%</strong>
              </span>
            </div>
          </div>

          {goalFeedbackError && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 rounded-xl px-4 py-2.5 text-xs font-medium">
              {goalFeedbackError}
            </div>
          )}

          <div className="space-y-3.5">
            {disciplineStats.map((stat) => {
              const draftValue = goalDrafts[stat.id] ?? String(stat.weeklyGoalMinutes);
              const hasPendingEdit =
                goalDrafts[stat.id] !== undefined && Number(goalDrafts[stat.id]) !== stat.weeklyGoalMinutes;
              const isSaving = savingGoalId === stat.id;
              const isSaved = Boolean(savedGoalIds[stat.id]);
              const goalMet = stat.weeklyMinutesLogged >= stat.weeklyGoalMinutes;
              const remainingMinutes = Math.max(0, stat.weeklyGoalMinutes - stat.weeklyMinutesLogged);

              return (
                <div
                  key={stat.id}
                  className="p-3.5 sm:p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 space-y-2.5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400 font-bold">
                          {String(stat.rank).padStart(2, '0')}.
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{stat.shortName}</h3>
                        <span
                          className={`text-[11px] font-medium ${
                            stat.hasCustomGoal ? 'text-[#146C43] dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {stat.hasCustomGoal ? 'Meta definida' : 'Sugestão inicial'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                        Real: <strong className="text-slate-900 dark:text-slate-100">{stat.weeklyMinutesLogged}m</strong> de{' '}
                        <strong className="text-slate-900 dark:text-slate-100">{stat.weeklyGoalMinutes}m</strong> ·{' '}
                        <span className={goalMet ? 'text-[#0B3321] dark:text-emerald-300 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
                          {goalMet
                            ? stat.weeklyMinutesLogged > stat.weeklyGoalMinutes
                              ? `+${stat.weeklyMinutesLogged - stat.weeklyGoalMinutes}m`
                              : 'Atingida!'
                            : `Faltam ${remainingMinutes}m`}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <label htmlFor={`goal-${stat.id}`} className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Meta (min):
                      </label>
                      <input
                        id={`goal-${stat.id}`}
                        type="number"
                        min={15}
                        max={2520}
                        step={15}
                        value={draftValue}
                        onChange={(e) =>
                          setGoalDrafts((prev) => ({
                            ...prev,
                            [stat.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSaveDisciplineGoal(stat.id, stat.weeklyGoalMinutes);
                          }
                        }}
                        className="w-20 min-h-[42px] px-2.5 py-1 text-xs font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                      />
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleSaveDisciplineGoal(stat.id, stat.weeklyGoalMinutes)}
                        className={`min-h-[42px] px-3.5 py-1.5 text-xs font-semibold rounded-xl inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                          isSaved
                            ? 'bg-emerald-700 text-white'
                            : hasPendingEdit
                              ? 'bg-[#0B3321] hover:bg-[#134b32] text-white'
                              : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-[#0B3321] text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {isSaved ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Salvo</span>
                          </>
                        ) : isSaving ? (
                          <span>Salvando...</span>
                        ) : (
                          <span>Salvar</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onStartFocusTimer(stat.id, stat.firstTopicTitle)}
                        title="Iniciar cronômetro e registrar minutos nesta disciplina"
                        className="min-h-[42px] px-3 py-1.5 bg-[#0B3321] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Estudar</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 flex-1 bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-label={`Progresso semanal em ${stat.shortName}: ${stat.weeklyMinutesLogged} de ${stat.weeklyGoalMinutes} minutos`}
                      aria-valuenow={stat.weeklyMinutesLogged}
                      aria-valuemin={0}
                      aria-valuemax={stat.weeklyGoalMinutes}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${stat.weeklyMinutesLogged > 0 ? Math.max(3, stat.weeklyGoalBarPct) : 0}%`,
                          backgroundColor: goalMet ? '#0B3321' : '#146C43',
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-[#0B3321] dark:text-emerald-300 tabular-nums w-12 text-right">
                      {stat.weeklyGoalRawPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {readerMaterial && (
        <BookReaderModal material={readerMaterial} onClose={() => setReaderMaterial(null)} />
      )}
    </div>
  );
}
