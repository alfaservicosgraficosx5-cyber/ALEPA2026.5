import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  CalendarCheck,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  FlipHorizontal,
  History,
  Loader2,
  MessageSquare,
  Network,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isMedioDisciplineId } from '../data/alepaMedioSyllabus';
import { getDisciplineShortName } from '../data/alepaSyllabus';
import { getLocalFile } from '../lib/localFiles';
import { CampusLevel, FlashcardItem, MindMapData, Question, StudyMaterial } from '../types';
import { extractYouTubeId, normalizeUrlInput } from '../utils/mediaUrls';
import { YouTubeBrandIcon } from './VideosView';

export interface GeminiTargetPreset {
  mode: 'video' | 'pdf' | 'professor';
  materialId?: string;
  url?: string;
  title?: string;
  disciplineId?: string;
}

interface GeminiSourceLink {
  title: string;
  uri: string;
}

interface SavedSummaryEntry {
  id: string;
  mode: 'video' | 'pdf';
  title: string;
  sourceUrl?: string;
  summary: string;
  sourceMode?: string;
  sources?: GeminiSourceLink[];
  createdAt: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const SUMMARIES_STORAGE_KEY = 'alepa_gemini_summaries_v1';

function loadSavedSummaries(): SavedSummaryEntry[] {
  try {
    const raw = localStorage.getItem(SUMMARIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedSummaries(items: SavedSummaryEntry[]): void {
  try {
    localStorage.setItem(SUMMARIES_STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    // ignore quota errors
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const base64 = res.includes(',') ? res.split(',')[1] || '' : res;
      if (!base64) {
        reject(new Error('Não foi possível ler o arquivo PDF selecionado.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo PDF.'));
    reader.readAsDataURL(file);
  });
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  // Highlight bold (**...**) and timestamp intervals like (0:58-2:30) or (01:12:05-01:15:30)
  const parts = text.split(/(\*\*[^*]+\*\*|\(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–]\s*\d{1,2}:\d{2}(?::\d{2})?)?\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^\(\d{1,2}:\d{2}/.test(part)) {
      return (
        <span
          key={idx}
          className="inline-block font-mono text-[11px] font-semibold px-1.5 py-0.5 mx-0.5 rounded bg-emerald-50 text-[#0B3321] border border-emerald-200 align-baseline"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function FormattedSummary({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={index} className="h-1" />;
        }
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="font-display text-sm sm:text-base font-bold text-[#0B3321] pt-2">
              {renderInlineFormatting(line.slice(4))}
            </h4>
          );
        }
        if (line.startsWith('## ') || line.startsWith('# ')) {
          const clean = line.replace(/^#{1,3}\s+/, '');
          return (
            <h3 key={index} className="font-display text-base sm:text-lg font-bold text-slate-900 pt-2">
              {renderInlineFormatting(clean)}
            </h3>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          return (
            <div key={index} className="flex items-start gap-2 pl-1">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#146C43] shrink-0" />
              <p className="flex-1">{renderInlineFormatting(line.replace(/^[-*•]\s+/, ''))}</p>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const match = line.match(/^(\d+\.)\s+(.*)$/);
          if (match) {
            return (
              <div key={index} className="flex items-start gap-2 pl-1">
                <span className="font-mono text-xs font-bold text-[#0B3321] mt-0.5 shrink-0">{match[1]}</span>
                <p className="flex-1">{renderInlineFormatting(match[2])}</p>
              </div>
            );
          }
        }
        return <p key={index}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
}

export function GeminiSummaryView({
  campus,
  presetTarget,
  onClearPreset,
}: {
  campus: CampusLevel;
  presetTarget?: GeminiTargetPreset | null;
  onClearPreset?: () => void;
}) {
  const { materials, topicProgressMap, errorNotebook, getCampusDisciplines } = useAuth();

  const [activeTab, setActiveTab] = useState<'professor' | 'video' | 'pdf' | 'chat'>(
    presetTarget?.mode || 'professor'
  );

  const campusDisciplines = useMemo(
    () => getCampusDisciplines(campus, 'cargo_01_04'),
    [getCampusDisciplines, campus]
  );

  // Professor IA State
  const [profDiscId, setProfDiscId] = useState<string>(() => campusDisciplines[0]?.id || 'processo_legislativo');
  const [profTopicId, setProfTopicId] = useState<string>(() => campusDisciplines[0]?.topics[0]?.id || '');
  const [profLoading, setProfLoading] = useState<string | null>(null);
  const [profTextResult, setProfTextResult] = useState<{ title: string; body: string } | null>(null);
  const [profFlashcards, setProfFlashcards] = useState<FlashcardItem[]>([]);
  const [profFlipped, setProfFlipped] = useState<Record<string, boolean>>({});
  const [profMindMap, setProfMindMap] = useState<MindMapData | null>(null);
  const [profQuestions, setProfQuestions] = useState<Question[]>([]);
  const [profQuizAnswers, setProfQuizAnswers] = useState<Record<string, number>>({});

  // Video Summarizer State
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDiscipline, setVideoDiscipline] = useState('');
  const [videoFocus, setVideoFocus] = useState('');
  const [videoNotes, setVideoNotes] = useState('');

  // PDF Summarizer State
  const [selectedPdfMaterialId, setSelectedPdfMaterialId] = useState<string>('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfDiscipline, setPdfDiscipline] = useState('');
  const [pdfFocus, setPdfFocus] = useState('');

  // Generation & Result State
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<SavedSummaryEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedHistory, setSavedHistory] = useState<SavedSummaryEntry[]>(() => loadSavedSummaries());

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const first = campusDisciplines[0];
    if (first && !campusDisciplines.some((d) => d.id === profDiscId)) {
      setProfDiscId(first.id);
      setProfTopicId(first.topics[0]?.id || '');
    }
  }, [campusDisciplines, profDiscId]);

  const selectedProfDisc = useMemo(
    () => campusDisciplines.find((d) => d.id === profDiscId) || campusDisciplines[0],
    [campusDisciplines, profDiscId]
  );

  const selectedProfTopic = useMemo(
    () => selectedProfDisc?.topics.find((t) => t.id === profTopicId) || selectedProfDisc?.topics[0],
    [selectedProfDisc, profTopicId]
  );

  const savedVideos = useMemo(() => {
    return materials.filter(
      (m) =>
        m.resourceType === 'video' ||
        m.fileType === 'video' ||
        /youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vimeo\.com/i.test(m.url)
    );
  }, [materials]);

  const savedPdfs = useMemo(() => {
    return materials.filter(
      (m) =>
        m.fileType === 'pdf' ||
        m.resourceType === 'pdf' ||
        m.resourceType === 'legislacao' ||
        m.resourceType === 'livro_digital' ||
        /\.pdf($|\?)/i.test(m.url) ||
        m.url.startsWith('local://')
    );
  }, [materials]);

  useEffect(() => {
    if (!presetTarget) return;
    setActiveTab(presetTarget.mode);
    setErrorMsg(null);
    if (presetTarget.mode === 'video') {
      setSelectedVideoId(presetTarget.materialId || '');
      setVideoUrl(presetTarget.url || '');
      setVideoTitle(presetTarget.title || '');
      setVideoDiscipline(presetTarget.disciplineId ? getDisciplineShortName(presetTarget.disciplineId) : '');
    } else {
      setSelectedPdfMaterialId(presetTarget.materialId || '');
      setPdfFile(null);
      setPdfUrl(presetTarget.url || '');
      setPdfTitle(presetTarget.title || '');
      setPdfDiscipline(presetTarget.disciplineId ? getDisciplineShortName(presetTarget.disciplineId) : '');
    }
    onClearPreset?.();
  }, [presetTarget, onClearPreset]);

  const handleSelectSavedVideo = (id: string) => {
    setSelectedVideoId(id);
    const found = savedVideos.find((v) => v.id === id);
    if (found) {
      setVideoUrl(found.url);
      setVideoTitle(found.title);
      setVideoDiscipline(getDisciplineShortName(found.disciplineId));
    }
  };

  const handleSelectSavedPdf = (id: string) => {
    setSelectedPdfMaterialId(id);
    const found = savedPdfs.find((p) => p.id === id);
    if (found) {
      setPdfFile(null);
      setPdfUrl(found.url);
      setPdfTitle(found.title);
      setPdfDiscipline(getDisciplineShortName(found.disciplineId));
    }
  };

  const saveSummaryToHistory = (entry: SavedSummaryEntry) => {
    setSavedHistory((prev) => {
      const next = [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 20);
      persistSavedSummaries(next);
      return next;
    });
  };

  const handleSummarizeVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanUrl = videoUrl.trim() ? normalizeUrlInput(videoUrl) : '';
    if (!cleanUrl && !videoNotes.trim()) {
      setErrorMsg('Cole o link do vídeo (YouTube, Instagram, TikTok) ou cole anotações/transcrição para resumir.');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/gemini/summarize-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          title: videoTitle.trim(),
          transcriptOrNotes: videoNotes.trim(),
          disciplineName: videoDiscipline.trim(),
          customFocus: videoFocus.trim(),
        }),
      });
      const data = (await response.json()) as {
        summary?: string;
        sourceMode?: string;
        sources?: GeminiSourceLink[];
        error?: string;
      };
      if (!response.ok || !data.summary) {
        throw new Error(data.error || 'Não foi possível resumir este vídeo agora.');
      }

      const entry: SavedSummaryEntry = {
        id: `vid_${Date.now()}`,
        mode: 'video',
        title: videoTitle.trim() || (extractYouTubeId(cleanUrl) ? 'Resumo de Vídeo YouTube' : 'Resumo de Vídeo'),
        sourceUrl: cleanUrl || undefined,
        summary: data.summary,
        sourceMode: data.sourceMode,
        sources: data.sources,
        createdAt: new Date().toLocaleString('pt-BR'),
      };
      setActiveResult(entry);
      saveSummaryToHistory(entry);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao conectar com o Gemini.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSummarizePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const chosenSaved: StudyMaterial | undefined = selectedPdfMaterialId
      ? savedPdfs.find((m) => m.id === selectedPdfMaterialId)
      : undefined;

    if (!pdfFile && !pdfUrl.trim() && !chosenSaved) {
      setErrorMsg('Envie um arquivo PDF, escolha um PDF salvo ou informe o link de um PDF.');
      return;
    }

    setGenerating(true);
    try {
      let fileBase64 = '';
      let fileName = pdfFile?.name || chosenSaved?.fileName || 'material.pdf';
      let targetUrl = pdfUrl.trim();

      if (pdfFile) {
        fileBase64 = await readFileAsBase64(pdfFile);
      } else if (targetUrl.startsWith('local://')) {
        const localKey = targetUrl.replace('local://', '');
        const localRec = await getLocalFile(localKey);
        if (!localRec) {
          throw new Error(
            'Este PDF local foi salvo em outro aparelho. Selecione o arquivo PDF manualmente no campo acima.'
          );
        }
        fileBase64 = arrayBufferToBase64(localRec.buffer);
        fileName = localRec.fileName;
        targetUrl = '';
      }

      const response = await fetch('/api/gemini/summarize-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: fileBase64 || undefined,
          fileName,
          pdfUrl: !fileBase64 ? targetUrl : undefined,
          title: pdfTitle.trim() || chosenSaved?.title || fileName,
          disciplineName: pdfDiscipline.trim(),
          customFocus: pdfFocus.trim(),
        }),
      });

      const data = (await response.json()) as {
        summary?: string;
        sourceMode?: string;
        sources?: GeminiSourceLink[];
        error?: string;
      };
      if (!response.ok || !data.summary) {
        throw new Error(data.error || 'Não foi possível resumir este PDF agora.');
      }

      const entry: SavedSummaryEntry = {
        id: `pdf_${Date.now()}`,
        mode: 'pdf',
        title: pdfTitle.trim() || pdfFile?.name || chosenSaved?.title || 'Resumo de PDF',
        sourceUrl: targetUrl && !targetUrl.startsWith('local://') ? targetUrl : undefined,
        summary: data.summary,
        sourceMode: data.sourceMode,
        sources: data.sources,
        createdAt: new Date().toLocaleString('pt-BR'),
      };
      setActiveResult(entry);
      saveSummaryToHistory(entry);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao resumir PDF no Gemini.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendChat = async (promptOverride?: string) => {
    const content = (promptOverride ?? chatInput).trim();
    if (!content || chatLoading) return;

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', text: content }];
    setChatMessages(nextMessages);
    if (!promptOverride) setChatInput('');
    setChatLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          contextTitle: activeResult?.title,
          contextSummary: activeResult?.summary,
          campus,
        }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Não foi possível obter resposta do Gemini.');
      }
      setChatMessages((prev) => [...prev, { role: 'model', text: data.reply! }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro no chat com o Gemini.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopySummary = async () => {
    if (!activeResult) return;
    try {
      await navigator.clipboard.writeText(activeResult.summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleDeleteHistory = (id: string) => {
    setSavedHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistSavedSummaries(next);
      return next;
    });
    if (activeResult?.id === id) {
      setActiveResult(null);
    }
  };

  const detectedYoutubeId = videoUrl.trim() ? extractYouTubeId(normalizeUrlInput(videoUrl)) : null;

  const handleRunProfessor = async (
    action: 'explain_topic' | 'generate_flashcards' | 'generate_mindmap' | 'generate_questions' | 'revision_plan'
  ) => {
    if (!selectedProfDisc || !selectedProfTopic) return;
    setProfLoading(action);
    setErrorMsg(null);

    try {
      const weakSummary = campusDisciplines
        .map((d) => {
          const avg = d.topics.length
            ? Math.round(
                d.topics.reduce((acc, t) => acc + (topicProgressMap[t.id]?.masteryLevel ?? 0), 0) / d.topics.length
              )
            : 0;
          return `${d.shortName}: ${avg}% concluído`;
        })
        .join(' | ');

      const pendingErrorsSummary = errorNotebook
        .filter((e) => e.status === 'pending' && (campus === 'medio' ? isMedioDisciplineId(e.disciplineId) : !isMedioDisciplineId(e.disciplineId)))
        .slice(0, 8)
        .map((e) => `${getDisciplineShortName(e.disciplineId)} - ${e.topicTitle} (motivo: ${e.errorReason})`)
        .join(' | ');

      const res = await fetch('/api/gemini/professor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          campus,
          disciplineName: selectedProfDisc.name,
          topicTitle: selectedProfTopic.title,
          subtopics: selectedProfTopic.subtopics,
          studentNotes: topicProgressMap[selectedProfTopic.id]?.notes || '',
          weakDisciplinesSummary: weakSummary,
          pendingErrorsSummary: pendingErrorsSummary || 'Nenhum erro pendente no caderno.',
          questionCount: 3,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        text?: string;
        flashcards?: Array<{ front: string; back: string; tip?: string }>;
        mindMap?: MindMapData;
        questions?: Question[];
      };
      if (!res.ok) {
        throw new Error(json.error || 'Não foi possível consultar o Professor IA.');
      }
      if ((action === 'explain_topic' || action === 'revision_plan') && json.text) {
        setProfTextResult({
          title:
            action === 'revision_plan'
              ? 'Plano Personalizado de Revisão (7 dias)'
              : `${selectedProfDisc.shortName} · ${selectedProfTopic.title}`,
          body: json.text,
        });
      } else if (action === 'generate_flashcards' && Array.isArray(json.flashcards)) {
        setProfFlashcards(
          json.flashcards.map((fc, idx) => ({ id: `pfc_${Date.now()}_${idx}`, front: fc.front, back: fc.back, tip: fc.tip }))
        );
        setProfFlipped({});
      } else if (action === 'generate_mindmap' && json.mindMap) {
        setProfMindMap(json.mindMap);
      } else if (action === 'generate_questions' && Array.isArray(json.questions)) {
        setProfQuestions(
          json.questions.map((q) => ({ ...q, disciplineId: selectedProfDisc.id }))
        );
        setProfQuizAnswers({});
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao executar ferramenta do Professor IA.');
    } finally {
      setProfLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-800 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#146C43]" />
            <span>Professor IA · Explicações, Flashcards, Mapas Mentais, Questões Inéditas e Resumos</span>
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
            Professor IA & Resumos Gemini
          </h1>
        </div>

        <a
          href="https://gemini.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[40px] px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap w-fit"
        >
          <span>Abrir Gemini Web</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-200/70 rounded-2xl w-full lg:w-fit">
        {(
          [
            { id: 'professor', label: 'Professor IA', icon: Brain },
            { id: 'video', label: 'Resumir Vídeo', icon: Video },
            { id: 'pdf', label: 'Resumir PDF', icon: FileText },
            { id: 'chat', label: 'Tutor Chat', icon: MessageSquare },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setErrorMsg(null);
              }}
              className={`min-h-[42px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                active ? 'bg-[#0B3321] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div role="alert" className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900">
          {errorMsg}
        </div>
      )}

      {/* TAB 0: PROFESSOR IA ESTRUTURADO */}
      {activeTab === 'professor' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-[#146C43]">Tutor Inteligente Baseado no Edital ALEPA 2026</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Escolha a disciplina e o assunto para estudar com o Professor IA
            </h2>
            <p className="text-xs text-slate-600">
              As questões inéditas geradas por IA são sempre marcadas como treinamento complementar e não substituem
              provas oficiais nem o texto vigente da lei.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="prof-disc" className="block text-xs font-semibold text-slate-700 mb-1">
                Disciplina do Edital
              </label>
              <select
                id="prof-disc"
                value={selectedProfDisc?.id || ''}
                onChange={(e) => {
                  const found = campusDisciplines.find((d) => d.id === e.target.value);
                  if (found) {
                    setProfDiscId(found.id);
                    setProfTopicId(found.topics[0]?.id || '');
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              >
                {campusDisciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.priorityRank}º · {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prof-topic" className="block text-xs font-semibold text-slate-700 mb-1">
                Assunto / Tópico
              </label>
              <select
                id="prof-topic"
                value={selectedProfTopic?.id || ''}
                onChange={(e) => setProfTopicId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              >
                {(selectedProfDisc?.topics || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {(
              [
                { id: 'explain_topic', label: 'Explicar Assunto', icon: BookOpen },
                { id: 'generate_flashcards', label: 'Gerar Flashcards', icon: Brain },
                { id: 'generate_mindmap', label: 'Mapa Mental', icon: Network },
                { id: 'generate_questions', label: '3 Questões IA', icon: Sparkles },
                { id: 'revision_plan', label: 'Plano 7 Dias', icon: CalendarCheck },
              ] as const
            ).map((btn) => {
              const Icon = btn.icon;
              const isLoading = profLoading === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={profLoading !== null}
                  onClick={() => void handleRunProfessor(btn.id)}
                  className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#0B3321] hover:bg-[#146C43] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>

          {profTextResult && (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#F5F7F6] border border-emerald-200 space-y-3">
              <p className="text-xs font-bold text-[#146C43]">{profTextResult.title}</p>
              <FormattedSummary text={profTextResult.body} />
            </div>
          )}

          {profMindMap && (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#F5F7F6] border border-slate-200 space-y-3">
              <p className="text-xs font-bold text-[#146C43]">Mapa Mental Estruturado</p>
              <div className="px-4 py-2.5 rounded-xl bg-[#0B3321] text-white text-sm font-bold text-center">
                {profMindMap.centralTopic}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {profMindMap.branches.map((b, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                    <p className="text-xs font-bold text-[#0B3321]">{b.title}</p>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {b.items.map((it, k) => (
                        <li key={k}>• {it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profFlashcards.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-[#146C43]">Flashcards Gerados ({profFlashcards.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profFlashcards.map((fc) => {
                  const flipped = Boolean(profFlipped[fc.id]);
                  return (
                    <button
                      key={fc.id}
                      type="button"
                      onClick={() => setProfFlipped((prev) => ({ ...prev, [fc.id]: !flipped }))}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-left space-y-2 hover:border-[#0B3321]"
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[#146C43]">
                        <span>{flipped ? 'RESPOSTA' : 'PERGUNTA'}</span>
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <FlipHorizontal className="w-3.5 h-3.5" /> Virar
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{flipped ? fc.back : fc.front}</p>
                      {flipped && fc.tip && (
                        <p className="text-xs text-[#0B3321] bg-[#E8F3EC] px-2.5 py-1 rounded-lg">{fc.tip}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {profQuestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-amber-800">
                Questões Inéditas para Treino (Geradas por IA · Professor Gemini)
              </p>
              {profQuestions.map((q, qIdx) => {
                const chosen = profQuizAnswers[q.id];
                const answered = chosen !== undefined;
                const letters = ['A', 'B', 'C', 'D', 'E'];
                return (
                  <div key={q.id} className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900">Questão IA {qIdx + 1} · {q.topicTitle}</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold text-[11px]">
                        Gerada por IA (Treino)
                      </span>
                    </div>
                    <p className="text-sm text-slate-900 font-medium">{q.statement}</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, idx) => {
                        const isRight = idx === q.correctIndex;
                        const isSel = chosen === idx;
                        let style = 'bg-white border-slate-200 text-slate-800';
                        if (answered) {
                          if (isRight) style = 'bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold';
                          else if (isSel) style = 'bg-red-50 border-red-500 text-red-950';
                        }
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (!answered) setProfQuizAnswers((p) => ({ ...p, [q.id]: idx }));
                            }}
                            className={`w-full text-left min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm flex items-start gap-2 ${style}`}
                          >
                            <span className="font-mono font-bold">{letters[idx]})</span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                    {answered && (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1">
                        <p className="font-semibold text-slate-900 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" /> Comentário do Professor IA:
                        </p>
                        <p>{q.explanation}</p>
                        {q.legalBasis && <p className="text-[#146C43] font-medium">Referência: {q.legalBasis}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 1: RESUMIR VÍDEO */}
      {activeTab === 'video' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-[#146C43]">Resumo Inteligente de Videoaulas</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Escolha um vídeo salvo ou cole o link do YouTube / aula
            </h2>
            <p className="text-xs text-slate-600">
              Para links do YouTube, o Gemini analisa o conteúdo da aula e gera o resumo estruturado por tópicos e
              minutagens (ex.: 0:00-0:37, 0:58-2:30).
            </p>
          </div>

          <form onSubmit={handleSummarizeVideo} className="space-y-3.5">
            {savedVideos.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Selecionar vídeo já salvo na aba Vídeos ({savedVideos.length})
                </label>
                <select
                  value={selectedVideoId}
                  onChange={(e) => handleSelectSavedVideo(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                >
                  <option value="">— Ou cole um novo link abaixo —</option>
                  {savedVideos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} ({getDisciplineShortName(v.disciplineId)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Link do vídeo (YouTube, Instagram, TikTok, etc.)
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Título / assunto (opcional)</label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Ex.: Princípios da Administração Pública – Art. 37 CF (LIMPE)"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                />
              </div>
            </div>

            {detectedYoutubeId && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <img
                  src={`https://img.youtube.com/vi/${detectedYoutubeId}/hqdefault.jpg`}
                  alt="Miniatura do vídeo"
                  className="w-24 h-14 object-cover rounded-lg bg-slate-900 shrink-0"
                />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                    <YouTubeBrandIcon className="w-4 h-4" />
                    <span>Vídeo do YouTube pronto para análise do Gemini</span>
                  </p>
                  <p className="text-slate-600 truncate mt-0.5">{videoTitle || videoUrl}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Disciplina (opcional)</label>
                <input
                  type="text"
                  value={videoDiscipline}
                  onChange={(e) => setVideoDiscipline(e.target.value)}
                  placeholder="Ex.: Direito Administrativo"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  O que destacar no resumo (opcional)
                </label>
                <input
                  type="text"
                  value={videoFocus}
                  onChange={(e) => setVideoFocus(e.target.value)}
                  placeholder="Ex.: Explicar tópicos com minutagem e pegadinhas CETAP"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Transcrição, legenda ou anotações extras (opcional — útil para Instagram/TikTok)
              </label>
              <textarea
                rows={3}
                value={videoNotes}
                onChange={(e) => setVideoNotes(e.target.value)}
                placeholder="Se quiser, cole aqui a transcrição ou anotações do vídeo para o Gemini resumir junto..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating}
                className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{generating ? 'Gerando resumo no Gemini...' : 'Resumir Vídeo com Gemini'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 2: RESUMIR PDF */}
      {activeTab === 'pdf' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-[#146C43]">Leitura e Síntese de Apostilas, Editais e Leis</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Envie um arquivo PDF ou selecione um material salvo
            </h2>
            <p className="text-xs text-slate-600">
              O Gemini lê o PDF completo (até 20 MB) e entrega visão geral, tópicos principais, prazos/artigos e resumo
              relâmpago para a prova.
            </p>
          </div>

          <form onSubmit={handleSummarizePdf} className="space-y-3.5">
            {/* Upload PDF from device */}
            <label className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#0B3321] bg-slate-50/70 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0B3321] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                    {pdfFile ? pdfFile.name : 'Clique para enviar um arquivo PDF do celular ou computador'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {pdfFile
                      ? `${(pdfFile.size / (1024 * 1024)).toFixed(2)} MB selecionado`
                      : 'Suporta PDF até 20 MB (apostilas, editais, leis, provas anteriores)'}
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPdfFile(file);
                  if (file && !pdfTitle.trim()) {
                    setPdfTitle(file.name.replace(/\.pdf$/i, ''));
                  }
                }}
                className="sr-only"
              />
              <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 shrink-0">
                {pdfFile ? 'Trocar PDF' : 'Selecionar PDF'}
              </span>
            </label>

            {savedPdfs.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ou escolha um PDF / Legislação já salvo em Conteúdo ({savedPdfs.length})
                </label>
                <select
                  value={selectedPdfMaterialId}
                  onChange={(e) => handleSelectSavedPdf(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                >
                  <option value="">— Selecionar material salvo —</option>
                  {savedPdfs.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.title} ({getDisciplineShortName(mat.disciplineId)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ou cole o link público do PDF / página da lei
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  placeholder="https://.../edital.pdf"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Título do material (opcional)</label>
                <input
                  type="text"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  placeholder="Ex.: Lei 5.810/1994 – RJU do Pará"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Disciplina (opcional)</label>
                <input
                  type="text"
                  value={pdfDiscipline}
                  onChange={(e) => setPdfDiscipline(e.target.value)}
                  placeholder="Ex.: Legislação ALEPA / Direito Constitucional"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Foco do resumo (opcional)</label>
                <input
                  type="text"
                  value={pdfFocus}
                  onChange={(e) => setPdfFocus(e.target.value)}
                  placeholder="Ex.: Destacar prazos, licenças e vedações mais cobradas"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating}
                className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{generating ? 'Lendo e resumindo PDF...' : 'Resumir PDF com Gemini'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 3: CHAT DIRETO COM GEMINI */}
      {activeTab === 'chat' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-[#146C43]">Tutor de Estudos Gemini</p>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Tirar dúvidas sobre o resumo ou matérias do Edital ALEPA
              </h2>
            </div>
            {activeResult && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[#0B3321] font-medium truncate max-w-xs">
                Contexto ativo: {activeResult.title}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              'Explique o mnemônico LIMPE (Art. 37 CF) com exemplos práticos de prova.',
              'Crie 5 questões objetivas estilo CETAP sobre o último resumo.',
              'Faça um resumo relâmpago em 5 pontos para revisão antes da prova.',
            ].map((quickPrompt) => (
              <button
                key={quickPrompt}
                type="button"
                onClick={() => void handleSendChat(quickPrompt)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-xs text-slate-800 text-left transition-colors"
              >
                {quickPrompt}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto p-3 rounded-xl bg-slate-50 border border-slate-200">
            {chatMessages.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 space-y-1">
                <BookOpen className="w-6 h-6 text-slate-400 mx-auto" />
                <p>Pergunte qualquer dúvida jurídica, peça questões ou peça explicações sobre seu vídeo/PDF resumido.</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#0B3321] text-white ml-6 sm:ml-16'
                      : 'bg-white border border-slate-200 text-slate-800 mr-2 sm:mr-10'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75 mb-1">
                    {msg.role === 'user' ? 'Você' : 'Gemini'}
                  </p>
                  {msg.role === 'user' ? <p>{msg.text}</p> : <FormattedSummary text={msg.text} />}
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-600 p-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#0B3321]" />
                <span>Gemini elaborando resposta...</span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Pergunte ao Gemini sobre o vídeo, PDF ou matéria do concurso..."
              className="flex-1 min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="min-h-[44px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span>Enviar</span>
            </button>
          </form>
        </section>
      )}

      {/* GENERATED SUMMARY OUTPUT */}
      {activeResult && (
        <section className="bg-white border-2 border-emerald-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#146C43] inline-flex items-center gap-1.5">
                {activeResult.mode === 'video' ? <Video className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                <span>
                  {activeResult.mode === 'video' ? 'Resumo de Vídeo' : 'Resumo de PDF'} · {activeResult.createdAt}
                </span>
              </p>
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                {activeResult.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopySummary}
                className="min-h-[38px] px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#146C43]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar resumo'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className="min-h-[38px] px-3 py-1.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Perguntar sobre este resumo</span>
              </button>

              {activeResult.sourceUrl && (
                <a
                  href={activeResult.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl inline-flex items-center gap-1.5"
                >
                  <span>Abrir fonte</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <FormattedSummary text={activeResult.summary} />

          {activeResult.sources && activeResult.sources.length > 0 && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Referências:</span>
              {activeResult.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0B3321] hover:underline inline-flex items-center gap-1"
                >
                  <span>{src.title}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SAVED SUMMARY HISTORY */}
      {savedHistory.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#146C43]" />
            <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Resumos recentes gerados no Gemini ({savedHistory.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {savedHistory.map((item) => {
              const isSelected = activeResult?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    isSelected ? 'border-[#0B3321] bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveResult(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-[11px] font-semibold text-[#146C43] inline-flex items-center gap-1">
                      {item.mode === 'video' ? <Video className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                      <span>{item.mode === 'video' ? 'Vídeo' : 'PDF'} · {item.createdAt}</span>
                    </p>
                    <p className="text-xs font-bold text-slate-900 truncate mt-0.5">{item.title}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteHistory(item.id)}
                    aria-label="Excluir resumo"
                    className="p-1.5 text-slate-400 hover:text-red-700 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
