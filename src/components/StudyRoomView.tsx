import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  FlipHorizontal,
  Headphones,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  Video,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isMedioDisciplineId } from '../data/alepaMedioSyllabus';
import { getDisciplineShortName } from '../data/alepaSyllabus';
import { VERIFIED_OFFICIAL_AND_ACADEMIC_SOURCES } from '../data/verifiedSources';
import {
  CampusLevel,
  FlashcardItem,
  MedioCargoGroup,
  MindMapData,
  NavSection,
  Question,
  StudyMaterial,
  SyllabusTopic,
} from '../types';
import { addDaysIso, saveLastStudiedContext } from '../utils/mediaUrls';
import { isPdfReadableMaterial } from '../lib/pdfBookEngine';
import { BookReaderModal } from './BookReaderModal';
import { PageHeader, SectionCard } from './ui/CampusPrimitives';

interface TopicRoomCache {
  explanation?: string;
  summary?: string;
  flashcards?: FlashcardItem[];
  mindMap?: MindMapData;
}

const ROOM_CACHE_PREFIX = 'alepa_study_room_cache_v1_';

function loadRoomCache(topicId: string): TopicRoomCache {
  try {
    const raw = localStorage.getItem(`${ROOM_CACHE_PREFIX}${topicId}`);
    if (!raw) return {};
    return JSON.parse(raw) as TopicRoomCache;
  } catch {
    return {};
  }
}

function saveRoomCache(topicId: string, patch: Partial<TopicRoomCache>): TopicRoomCache {
  const next = { ...loadRoomCache(topicId), ...patch };
  try {
    localStorage.setItem(`${ROOM_CACHE_PREFIX}${topicId}`, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export function StudyRoomView({
  campus,
  medioCargoGroup = 'cargo_01_04',
  selectedDisciplineId,
  selectedTopicId,
  onSelectTopic,
  onNavigate,
  onStartFocusTimer,
}: {
  campus: CampusLevel;
  medioCargoGroup?: MedioCargoGroup;
  selectedDisciplineId?: string;
  selectedTopicId?: string;
  onSelectTopic: (disciplineId: string, topicId: string) => void;
  onNavigate: (section: NavSection) => void;
  onStartFocusTimer: (disciplineId: string, topicTitle: string) => void;
}) {
  const {
    topicProgressMap,
    saveTopicProgress,
    materials,
    questions,
    errorNotebook,
    addErrorEntry,
    getCampusDisciplines,
  } = useAuth();
  const isMedio = campus === 'medio';
  const disciplines = useMemo(
    () => getCampusDisciplines(campus, medioCargoGroup),
    [getCampusDisciplines, campus, medioCargoGroup]
  );

  const activeDiscipline = useMemo(() => {
    return disciplines.find((d) => d.id === selectedDisciplineId) || disciplines[0];
  }, [disciplines, selectedDisciplineId]);

  const activeTopic: SyllabusTopic | undefined = useMemo(() => {
    if (!activeDiscipline) return undefined;
    return activeDiscipline.topics.find((t) => t.id === selectedTopicId) || activeDiscipline.topics[0];
  }, [activeDiscipline, selectedTopicId]);

  const progress = activeTopic ? topicProgressMap[activeTopic.id] : undefined;

  const [noteDraft, setNoteDraft] = useState(progress?.notes || '');
  const [savingProg, setSavingProg] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [roomCache, setRoomCache] = useState<TopicRoomCache>(() =>
    activeTopic ? loadRoomCache(activeTopic.id) : {}
  );
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Interactive Flashcards state
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [cardRatings, setCardRatings] = useState<Record<string, 'facil' | 'revisar'>>({});

  // Quick Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [activeBookMaterial, setActiveBookMaterial] = useState<StudyMaterial | null>(null);

  useEffect(() => {
    if (!activeTopic || !activeDiscipline) return;
    setNoteDraft(topicProgressMap[activeTopic.id]?.notes || '');
    setRoomCache(loadRoomCache(activeTopic.id));
    setFlippedCards({});
    setQuizAnswers({});
    setAiError(null);
    saveLastStudiedContext({
      campus,
      section: 'study_room',
      disciplineId: activeDiscipline.id,
      topicId: activeTopic.id,
      topicTitle: activeTopic.title,
      label: `${activeDiscipline.shortName} · ${activeTopic.title}`,
    });
  }, [activeTopic?.id, activeDiscipline?.id, campus]);

  const topicMaterials = useMemo(() => {
    if (!activeDiscipline || !activeTopic) return { pdfs: [], videos: [], audios: [] };
    const topicLower = activeTopic.title.toLowerCase();
    const discMaterials = materials.filter((m) => {
      if (m.campusLevel && m.campusLevel !== 'geral' && m.campusLevel !== campus) return false;
      if (m.disciplineId === activeDiscipline.id) return true;
      if (m.disciplineId.startsWith('geral_') && activeDiscipline.shortName.toLowerCase().includes(m.disciplineId.replace('geral_', '').replace('_', ' '))) {
        return true;
      }
      return (m.editalTopic || '').toLowerCase().includes(topicLower.slice(0, 12));
    });

    const pdfs = discMaterials.filter(
      (m) =>
        m.fileType === 'pdf' ||
        m.fileType === 'drive' ||
        m.resourceType === 'pdf' ||
        m.resourceType === 'legislacao' ||
        m.resourceType === 'livro_digital'
    );
    const videos = discMaterials.filter(
      (m) => m.fileType === 'video' || m.resourceType === 'video'
    );
    const audios = discMaterials.filter((m) => m.resourceType === 'podcast');
    return { pdfs: pdfs.slice(0, 6), videos: videos.slice(0, 6), audios: audios.slice(0, 4) };
  }, [materials, activeDiscipline, activeTopic]);

  const topicVerifiedSources = useMemo(() => {
    if (!activeDiscipline) return [];
    return VERIFIED_OFFICIAL_AND_ACADEMIC_SOURCES.filter(
      (s) => s.disciplines.includes('all') || s.disciplines.includes(activeDiscipline.id)
    ).slice(0, 6);
  }, [activeDiscipline]);

  const topicQuestions = useMemo(() => {
    if (!activeDiscipline || !activeTopic) return [] as Question[];
    const keywords = activeTopic.title
      .toLowerCase()
      .split(/[\s,()/:;-]+/)
      .filter((w) => w.length > 3);
    const discPool = questions.filter((q) =>
      isMedio
        ? isMedioDisciplineId(q.disciplineId) && q.disciplineId === activeDiscipline.id
        : !isMedioDisciplineId(q.disciplineId) && q.disciplineId === activeDiscipline.id
    );
    const matched = discPool.filter((q) => {
      const target = `${q.topicTitle} ${q.statement}`.toLowerCase();
      return keywords.some((kw) => target.includes(kw));
    });
    return (matched.length > 0 ? matched : discPool).slice(0, 4);
  }, [questions, activeDiscipline, activeTopic, isMedio]);

  const topicErrors = useMemo(() => {
    if (!activeDiscipline || !activeTopic) return [];
    return errorNotebook.filter(
      (e) =>
        e.disciplineId === activeDiscipline.id &&
        e.topicTitle.toLowerCase().includes(activeTopic.title.toLowerCase().slice(0, 10))
    );
  }, [errorNotebook, activeDiscipline, activeTopic]);

  const fallbackMindMap: MindMapData = useMemo(() => {
    const subs = activeTopic?.subtopics || [];
    return {
      centralTopic: activeTopic?.title || 'Assunto do Edital',
      branches: [
        {
          title: 'Subtópicos do Edital',
          items: subs.length > 0 ? subs.slice(0, 5) : ['Conceitos fundamentais', 'Estrutura normativa'],
        },
        {
          title: 'Foco Fundação CETAP',
          items: [
            activeTopic?.highYield ? 'Tema de alta incidência em prova' : 'Cobrança objetiva conceitual',
            'Atenção às exceções legais e prazos',
            'Leitura atenta do enunciado (correta × incorreta)',
          ],
        },
        {
          title: 'Ciclo de Memorização',
          items: [
            progress?.theoryDone ? 'Teoria concluída' : 'Ler base teórica / lei seca',
            progress?.questionsDone ? 'Questões resolvidas' : 'Resolver bateria do assunto',
            progress?.revisionDone ? 'Revisão feita' : 'Agendar revisão D+1 / D+7',
          ],
        },
      ],
    };
  }, [activeTopic, progress]);

  const defaultFlashcards: FlashcardItem[] = useMemo(() => {
    if (!activeTopic || !activeDiscipline) return [];
    const baseCards: FlashcardItem[] = [
      {
        id: 'fc_default_1',
        front: `Qual é o foco principal de "${activeTopic.title}" em ${activeDiscipline.shortName}?`,
        back:
          activeTopic.subtopics.length > 0
            ? `Subtópicos do edital: ${activeTopic.subtopics.join('; ')}.`
            : `Domínio dos conceitos e aplicação prática conforme o Anexo II da ALEPA.`,
        tip: activeTopic.highYield ? 'Prioridade alta na Banca CETAP.' : 'Estude com resolução de questões.',
      },
    ];
    activeTopic.subtopics.slice(0, 3).forEach((sub, idx) => {
      baseCards.push({
        id: `fc_default_${idx + 2}`,
        front: `Subtópico ${idx + 1}: o que devo revisar sobre "${sub}"?`,
        back: 'Verifique a definição principal, a base normativa/teórica e as exceções mais cobradas em questões objetivas.',
        tip: 'Use o Professor IA abaixo para gerar flashcards aprofundados com exemplos.',
      });
    });
    return baseCards;
  }, [activeTopic, activeDiscipline]);

  const activeMindMap = roomCache.mindMap || fallbackMindMap;
  const activeFlashcards = roomCache.flashcards && roomCache.flashcards.length > 0 ? roomCache.flashcards : defaultFlashcards;

  const handleToggleStage = async (field: 'theoryDone' | 'questionsDone' | 'revisionDone') => {
    if (!activeTopic || !activeDiscipline) return;
    setSavingProg(true);
    setFeedback(null);
    try {
      const nextVal = !(progress?.[field] ?? false);
      await saveTopicProgress(activeTopic.id, activeDiscipline.id, { [field]: nextVal });
      setFeedback('Progresso da Sala de Estudo atualizado.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Não foi possível salvar progresso.');
    } finally {
      setSavingProg(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!activeTopic || !activeDiscipline) return;
    setSavingProg(true);
    setFeedback(null);
    try {
      await saveTopicProgress(activeTopic.id, activeDiscipline.id, { notes: noteDraft });
      setFeedback('Anotações pessoais salvas.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar anotações.');
    } finally {
      setSavingProg(false);
    }
  };

  const handleRunProfessorAction = async (
    action: 'explain_topic' | 'generate_flashcards' | 'generate_mindmap'
  ) => {
    if (!activeTopic || !activeDiscipline) return;
    setLoadingAction(action);
    setAiError(null);
    try {
      const res = await fetch('/api/gemini/professor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          campus,
          disciplineName: activeDiscipline.name,
          topicTitle: activeTopic.title,
          subtopics: activeTopic.subtopics,
          studentNotes: noteDraft,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        text?: string;
        flashcards?: Array<{ front: string; back: string; tip?: string }>;
        mindMap?: MindMapData;
      };
      if (!res.ok) {
        throw new Error(json.error || 'Não foi possível consultar o Professor IA.');
      }
      if (action === 'explain_topic' && json.text) {
        setRoomCache(saveRoomCache(activeTopic.id, { explanation: json.text }));
      } else if (action === 'generate_flashcards' && Array.isArray(json.flashcards)) {
        const mapped: FlashcardItem[] = json.flashcards.map((fc, idx) => ({
          id: `fc_ai_${Date.now()}_${idx}`,
          front: fc.front,
          back: fc.back,
          tip: fc.tip,
        }));
        setRoomCache(saveRoomCache(activeTopic.id, { flashcards: mapped }));
        setFlippedCards({});
      } else if (action === 'generate_mindmap' && json.mindMap?.branches) {
        setRoomCache(saveRoomCache(activeTopic.id, { mindMap: json.mindMap }));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao conectar com o Professor IA.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSelectQuickAnswer = async (q: Question, idx: number) => {
    if (quizAnswers[q.id] !== undefined) return;
    setQuizAnswers((prev) => ({ ...prev, [q.id]: idx }));
    if (idx !== q.correctIndex) {
      try {
        await addErrorEntry({
          questionId: q.id,
          disciplineId: q.disciplineId,
          topicTitle: q.topicTitle,
          questionStem: q.statement,
          correctOption: `${LETTERS[q.correctIndex]}) ${q.options[q.correctIndex]}`,
          selectedOption: `${LETTERS[idx]}) ${q.options[idx]}`,
          errorReason: 'teoria',
          improvementNote: q.explanation,
        });
      } catch {
        // non-blocking
      }
    }
  };

  if (!activeDiscipline || !activeTopic) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Sala de Estudo por Assunto · ${isMedio ? 'Nível Médio (001/2026)' : 'Nível Superior (002/2026)'}`}
        title={activeTopic.title}
        subtitle={`${activeDiscipline.name} · ${activeTopic.highYield ? 'Alta incidência CETAP' : 'Conteúdo programático oficial'}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('disciplines')}
              className="min-h-[42px] px-3.5 py-2 bg-white border border-slate-200 hover:border-[#0B3321] text-slate-800 text-xs sm:text-sm font-medium rounded-xl inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Edital</span>
            </button>
            <button
              type="button"
              onClick={() => onStartFocusTimer(activeDiscipline.id, activeTopic.title)}
              className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#146C43] text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5"
            >
              <Target className="w-4 h-4" />
              <span>Estudar 2h neste assunto</span>
            </button>
          </>
        }
      />

      {/* Seletor rápido de disciplina e tópico dentro da Sala */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="room-disc-select" className="block text-xs font-semibold text-slate-700 mb-1">
            Disciplina
          </label>
          <select
            id="room-disc-select"
            value={activeDiscipline.id}
            onChange={(e) => {
              const nextDisc = disciplines.find((d) => d.id === e.target.value);
              if (nextDisc && nextDisc.topics[0]) {
                onSelectTopic(nextDisc.id, nextDisc.topics[0].id);
              }
            }}
            className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
          >
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.priorityRank}º · {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="room-topic-select" className="block text-xs font-semibold text-slate-700 mb-1">
            Assunto / Tópico do Edital
          </label>
          <select
            id="room-topic-select"
            value={activeTopic.id}
            onChange={(e) => onSelectTopic(activeDiscipline.id, e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
          >
            {activeDiscipline.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.highYield ? '★ ' : ''}
                {t.title} ({topicProgressMap[t.id]?.masteryLevel ?? 0}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div className="bg-[#E8F3EC] border border-emerald-200 text-[#0B3321] rounded-xl px-4 py-2.5 text-xs font-medium">
          {feedback}
        </div>
      )}
      {aiError && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-xs font-medium">
          {aiError}
        </div>
      )}

      {/* 1. Objetivos & 12. Progresso */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          title="1. Objetivos de Aprendizagem"
          subtitle="O que você precisa dominar neste tópico do Anexo II"
          className="lg:col-span-2"
        >
          <ul className="space-y-2">
            {activeTopic.subtopics.map((sub, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-[#146C43] shrink-0" />
                <span>{sub}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="font-mono font-semibold text-[#0B3321]">
              Peso na disciplina: {activeDiscipline.examQuestions}q · {activeDiscipline.examPoints.toFixed(1)} pts
            </span>
            <span aria-hidden="true">·</span>
            <span>Ciclo recomendado: {activeDiscipline.recommendedMinutesPerCycle} min</span>
          </div>
        </SectionCard>

        <SectionCard
          title="12. Controle de Progresso"
          subtitle={`Domínio atual: ${progress?.masteryLevel ?? 0}%`}
        >
          <div className="space-y-3">
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#146C43] rounded-full transition-all"
                style={{ width: `${progress?.masteryLevel ?? 0}%` }}
              />
            </div>
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  { key: 'theoryDone', label: 'Teoria & Lei Seca concluída (40%)' },
                  { key: 'questionsDone', label: 'Bateria de Questões feita (40%)' },
                  { key: 'revisionDone', label: 'Revisão Espaçada registrada (20%)' },
                ] as const
              ).map((step) => {
                const done = Boolean(progress?.[step.key]);
                return (
                  <button
                    key={step.key}
                    type="button"
                    disabled={savingProg}
                    onClick={() => handleToggleStage(step.key)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                      done
                        ? 'bg-[#E8F3EC] border-[#146C43] text-[#0B3321]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{step.label}</span>
                    <Check className={`w-4 h-4 shrink-0 ${done ? 'text-[#146C43]' : 'text-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* 2. Explicação Teórica + 6. Resumo do Assunto */}
      <SectionCard
        title="2. Explicação Teórica & Resumo Orientado (Professor IA)"
        subtitle="Gere uma aula objetiva focada nos subtópicos do edital e pegadinhas da Fundação CETAP"
        rightSlot={
          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => handleRunProfessorAction('explain_topic')}
            className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#146C43] disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2"
          >
            {loadingAction === 'explain_topic' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{roomCache.explanation ? 'Atualizar explicação IA' : 'Gerar explicação do assunto'}</span>
          </button>
        }
      >
        {roomCache.explanation ? (
          <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed bg-[#F5F7F6] border border-slate-200 rounded-xl p-4 sm:p-5 text-sm">
            {roomCache.explanation}
          </div>
        ) : (
          <div className="p-5 rounded-xl bg-[#F5F7F6] border border-slate-200 text-sm text-slate-700 space-y-2">
            <p className="font-semibold text-slate-900">Guia de estudo do assunto:</p>
            <p>
              Clique em <strong>"Gerar explicação do assunto"</strong> para o Professor IA estruturar os conceitos
              centrais de <strong>{activeTopic.title}</strong> com foco na Banca CETAP e pontos de revisão rápida.
            </p>
          </div>
        )}
      </SectionCard>

      {/* 3. Materiais em PDF + 4. Fontes Verificadas + 5. Videoaulas & Áudios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          title="3. Materiais em PDF e Documentos"
          subtitle={`${topicMaterials.pdfs.length} selecionados para ${activeDiscipline.shortName}`}
        >
          {topicMaterials.pdfs.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum PDF cadastrado especificamente nesta disciplina ainda. Você pode adicionar na Central Inteligente.
            </p>
          ) : (
            <div className="space-y-2.5">
              {topicMaterials.pdfs.map((mat) => {
                const openInBookReader = isPdfReadableMaterial(mat);
                const allowDownload = mat.allowDownload !== false;
                if (openInBookReader) {
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => setActiveBookMaterial(mat)}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/70 flex items-start justify-between gap-2 text-xs transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 line-clamp-2">{mat.title}</p>
                        <p className="text-[11px] text-[#146C43] font-medium mt-0.5">
                          Ler no Book Reader · {mat.institution || 'Biblioteca ALEPA'}
                        </p>
                      </div>
                      <BookOpen className="w-4 h-4 text-[#146C43] shrink-0 mt-0.5" />
                    </button>
                  );
                }
                return (
                  <a
                    key={mat.id}
                    href={mat.url.startsWith('local://') || !allowDownload ? '#' : mat.url}
                    target={mat.url.startsWith('local://') || !allowDownload ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (mat.url.startsWith('local://') || !allowDownload) {
                        e.preventDefault();
                        onNavigate('materials');
                      }
                    }}
                    className="p-3 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/70 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 line-clamp-2">{mat.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{mat.institution || 'Biblioteca ALEPA'}</p>
                    </div>
                    <FileText className="w-4 h-4 text-[#146C43] shrink-0 mt-0.5" />
                  </a>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => onNavigate('materials')}
            className="mt-3 text-xs font-semibold text-[#0B3321] hover:underline inline-flex items-center gap-1"
          >
            Abrir Central de Materiais →
          </button>
        </SectionCard>

        <SectionCard
          title="4. Fontes Oficiais & Acadêmicas"
          subtitle="Portais verificados para consulta segura"
        >
          <div className="space-y-2.5">
            {topicVerifiedSources.map((src) => (
              <a
                key={src.id}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/70 flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{src.title}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{src.description}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              </a>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="5. Videoaulas e Podcasts"
          subtitle="Aulas e áudios vinculados à matéria"
        >
          <div className="space-y-2.5">
            {topicMaterials.videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/70 flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 line-clamp-2">{v.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Vídeo · {v.institution || 'Aula'}</p>
                </div>
                <Video className="w-4 h-4 text-[#146C43] shrink-0 mt-0.5" />
              </a>
            ))}
            {topicMaterials.audios.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/70 flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 line-clamp-2">{a.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Podcast / Áudio</p>
                </div>
                <Headphones className="w-4 h-4 text-[#146C43] shrink-0 mt-0.5" />
              </a>
            ))}
            {topicMaterials.videos.length === 0 && topicMaterials.audios.length === 0 && (
              <p className="text-xs text-slate-500">
                Cadastre videoaulas ou episódios do Spotify nas abas Vídeos ou Podcasts para vê-los aqui.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[#0B3321]">
            <button type="button" onClick={() => onNavigate('videos')} className="hover:underline">
              Ver Vídeos
            </button>
            <button type="button" onClick={() => onNavigate('podcasts')} className="hover:underline">
              Ver Podcasts
            </button>
          </div>
        </SectionCard>
      </div>

      {/* 7. Mapa Mental + 8. Flashcards Interativos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          title="7. Mapa Mental do Assunto"
          subtitle="Estrutura hierárquica para revisão visual rápida"
          rightSlot={
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => handleRunProfessorAction('generate_mindmap')}
              className="min-h-[38px] px-3 py-1.5 bg-[#E8F3EC] hover:bg-emerald-100 text-[#0B3321] text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
            >
              {loadingAction === 'generate_mindmap' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Network className="w-3.5 h-3.5" />
              )}
              <span>Gerar com IA</span>
            </button>
          }
        >
          <div className="space-y-3">
            <div className="px-4 py-2.5 rounded-xl bg-[#0B3321] text-white text-sm font-display font-bold text-center">
              {activeMindMap.centralTopic}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeMindMap.branches.map((branch, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-[#F5F7F6] border border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-[#0B3321]">{branch.title}</p>
                  <ul className="space-y-1">
                    {branch.items.map((item, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                        <span className="text-[#146C43] font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="8. Flashcards de Memorização Ativa"
          subtitle="Toque no cartão para virar e avaliar sua fixação"
          rightSlot={
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => handleRunProfessorAction('generate_flashcards')}
              className="min-h-[38px] px-3 py-1.5 bg-[#E8F3EC] hover:bg-emerald-100 text-[#0B3321] text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
            >
              {loadingAction === 'generate_flashcards' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              <span>Gerar flashcards IA</span>
            </button>
          }
        >
          <div className="space-y-3">
            {activeFlashcards.map((card) => {
              const isFlipped = Boolean(flippedCards[card.id]);
              const rating = cardRatings[card.id];
              return (
                <div
                  key={card.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setFlippedCards((prev) => ({ ...prev, [card.id]: !isFlipped }))}
                    className="w-full text-left space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#146C43]">
                      <span>{isFlipped ? 'VERSO · RESPOSTA' : 'FRENTE · PERGUNTA'}</span>
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <FlipHorizontal className="w-3.5 h-3.5" /> Virar cartão
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                      {isFlipped ? card.back : card.front}
                    </p>
                    {isFlipped && card.tip && (
                      <p className="text-xs text-[#0B3321] bg-[#E8F3EC] px-2.5 py-1.5 rounded-lg">
                        Dica: {card.tip}
                      </p>
                    )}
                  </button>

                  {isFlipped && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setCardRatings((prev) => ({ ...prev, [card.id]: 'facil' }))}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold border ${
                          rating === 'facil'
                            ? 'bg-[#16A34A] text-white border-[#16A34A]'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        Dominei
                      </button>
                      <button
                        type="button"
                        onClick={() => setCardRatings((prev) => ({ ...prev, [card.id]: 'revisar' }))}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold border ${
                          rating === 'revisar'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        Revisar depois
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* 9. Questões Relacionadas & 10. Mini Prática */}
      <SectionCard
        title="9 e 10. Questões Relacionadas & Mini Prática Rápida"
        subtitle="Resolva questões do banco ligadas a esta disciplina (erros vão direto ao Caderno de Erros)"
        rightSlot={
          <button
            type="button"
            onClick={() => onNavigate('simulados')}
            className="min-h-[38px] px-3.5 py-1.5 border border-slate-200 hover:border-[#0B3321] rounded-xl text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Abrir Simulado Completo</span>
          </button>
        }
      >
        {topicQuestions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma questão vinculada a {getDisciplineShortName(activeDiscipline.id)} neste filtro. Use o Banco de
            Questões ou o Professor IA para gerar questões inéditas.
          </p>
        ) : (
          <div className="space-y-5">
            {topicQuestions.map((q, qIdx) => {
              const selected = quizAnswers[q.id];
              const answered = selected !== undefined;
              return (
                <div key={q.id} className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">
                      Questão {qIdx + 1} · {q.topicTitle}
                    </span>
                    <span className={q.isOfficial ? 'text-[#146C43] font-semibold' : 'text-amber-800 font-medium'}>
                      {q.source || (q.isOfficial ? 'Fonte Oficial' : 'Treinamento')}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">{q.statement}</p>
                  <div className="space-y-2">
                    {q.options.map((opt, idx) => {
                      const isCorrect = idx === q.correctIndex;
                      const isChosen = selected === idx;
                      let cls = 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50';
                      if (answered) {
                        if (isCorrect) cls = 'bg-emerald-50 border-emerald-600 text-emerald-950 font-medium';
                        else if (isChosen) cls = 'bg-red-50 border-red-500 text-red-950';
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectQuickAnswer(q, idx)}
                          className={`w-full text-left min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 transition-colors ${cls}`}
                        >
                          <span className="font-mono font-bold shrink-0">{LETTERS[idx]})</span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {answered && (
                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" /> Comentário:
                      </p>
                      <p>{q.explanation}</p>
                      {q.legalBasis && <p className="text-[#146C43] font-medium">Base: {q.legalBasis}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* 11. Revisão Programada & Anotações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          title="11. Revisão & Caderno de Erros do Assunto"
          subtitle={`Próximo ciclo sugerido: ${addDaysIso(7).split('-').reverse().join('/')}`}
          rightSlot={
            <button
              type="button"
              onClick={() => onNavigate('revisions')}
              className="min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Abrir Revisões</span>
            </button>
          }
        >
          {topicErrors.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#F5F7F6] border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
              <RefreshCw className="w-4 h-4 text-[#146C43] shrink-0 mt-0.5" />
              <p>
                Nenhum erro pendente registrado neste tópico. Se você errar alguma questão na mini prática acima ou nos
                simulados, ela aparecerá aqui para revisão espaçada automática.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topicErrors.slice(0, 4).map((err) => (
                <div key={err.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Status: {err.status === 'mastered' ? 'Dominada' : 'Pendente'}</span>
                    <span>Próx. revisão: {err.nextReviewDate.split('-').reverse().join('/')}</span>
                  </div>
                  <p className="font-medium text-slate-900 line-clamp-2">{err.questionStem}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Anotações Pessoais de Lei Seca & Resumo"
          subtitle="Sincronizado com seu progresso do edital"
        >
          <div className="space-y-3">
            <textarea
              rows={5}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Anote artigos importantes, prazos, exceções da banca CETAP e dúvidas para revisar..."
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={savingProg}
                onClick={handleSaveNotes}
                className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#146C43] disabled:opacity-50 text-white text-xs font-semibold rounded-xl"
              >
                Salvar anotações
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {activeBookMaterial && (
        <BookReaderModal
          material={activeBookMaterial}
          onClose={() => setActiveBookMaterial(null)}
        />
      )}
    </div>
  );
}
