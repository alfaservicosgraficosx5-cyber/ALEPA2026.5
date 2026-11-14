import React, { useState } from 'react';
import { Bell, CheckCircle2, Cloud, LogIn, LogOut, RefreshCw, Settings, Smartphone, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CONCURSO_PROFILE } from '../data/alepaSyllabus';
import { CampusLevel, NavSection, SpacedRepetitionConfig } from '../types';
import {
  SPACED_REPETITION_PRESETS,
  loadSpacedRepetitionConfig,
  saveSpacedRepetitionConfig,
} from '../utils/mediaUrls';
import { PageHeader, SectionCard } from './ui/CampusPrimitives';

export function SettingsView({
  campus,
  onChangeCampus,
  onNavigate,
}: {
  campus: CampusLevel;
  onChangeCampus: (campus: CampusLevel) => void;
  onNavigate: (section: NavSection) => void;
}) {
  const { user, isGuest, profile, updateProfileSettings, logout, exitGuestMode } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(
    profile?.dailyGoalMinutes || CONCURSO_PROFILE.dailyGoalMinutes
  );
  const [examDate, setExamDate] = useState(profile?.examDate || CONCURSO_PROFILE.examDate);
  const [targetCargo, setTargetCargo] = useState(
    profile?.targetCargo || 'Cargo 03 – Técnico Legislativo (PL.AL.102)'
  );
  const [spacedConfig, setSpacedConfig] = useState<SpacedRepetitionConfig>(() =>
    loadSpacedRepetitionConfig()
  );

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await updateProfileSettings({
        displayName: displayName.trim() || profile?.displayName || 'Estudante ALEPA',
        dailyGoalMinutes: Math.max(15, Math.min(720, Math.round(dailyGoalMinutes))),
        examDate: examDate.trim() || CONCURSO_PROFILE.examDate,
        targetCargo: targetCargo.trim() || 'Cargo 03 – Técnico Legislativo (PL.AL.102)',
      });
      setFeedback('Configurações do perfil e meta diária salvas com sucesso.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeSpacedPreset = (preset: SpacedRepetitionConfig['preset']) => {
    const next: SpacedRepetitionConfig = {
      preset,
      intervals: SPACED_REPETITION_PRESETS[preset].intervals,
    };
    setSpacedConfig(next);
    saveSpacedRepetitionConfig(next);
    setFeedback(`Ciclo de revisão espaçada alterado para: ${SPACED_REPETITION_PRESETS[preset].label}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Preferências do Estudante & Conta"
        title="Configurações"
        subtitle="Personalize sua meta diária, cargo alvo, ciclos de revisão espaçada e sincronização entre dispositivos."
      />

      {feedback && (
        <div className="bg-[#E8F3EC] border border-emerald-200 text-[#0B3321] rounded-xl px-4 py-3 text-xs sm:text-sm font-medium inline-flex items-center gap-2 w-full">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-xs sm:text-sm font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Perfil de Estudo & Meta Diária"
          subtitle="Dados sincronizados na nuvem quando conectado ao Google/E-mail"
        >
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="cfg-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome de exibição
              </label>
              <input
                id="cfg-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
                className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cfg-goal" className="block text-xs font-semibold text-slate-700 mb-1">
                  Meta diária (minutos)
                </label>
                <input
                  id="cfg-goal"
                  type="number"
                  min={15}
                  max={720}
                  value={dailyGoalMinutes}
                  onChange={(e) => setDailyGoalMinutes(Number(e.target.value) || 120)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                />
              </div>

              <div>
                <label htmlFor="cfg-exam" className="block text-xs font-semibold text-slate-700 mb-1">
                  Data prevista da prova
                </label>
                <input
                  id="cfg-exam"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cfg-cargo" className="block text-xs font-semibold text-slate-700 mb-1">
                Cargo alvo
              </label>
              <input
                id="cfg-cargo"
                type="text"
                value={targetCargo}
                onChange={(e) => setTargetCargo(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Campus ativo padrão</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeCampus('superior')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold ${
                    campus === 'superior'
                      ? 'bg-[#0B3321] text-white border-[#0B3321]'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  Nível Superior (002/2026)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCampus('medio')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold ${
                    campus === 'medio'
                      ? 'bg-[#0B3321] text-white border-[#0B3321]'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  Nível Médio (001/2026)
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] hover:bg-[#146C43] disabled:opacity-50 text-white text-sm font-semibold rounded-xl w-full sm:w-auto"
            >
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </form>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Ciclos de Revisão Espaçada"
            subtitle="Configure os intervalos padrão sugeridos no Caderno de Erros"
          >
            <div className="space-y-2.5">
              {(Object.keys(SPACED_REPETITION_PRESETS) as Array<SpacedRepetitionConfig['preset']>).map((key) => {
                const preset = SPACED_REPETITION_PRESETS[key];
                const active = spacedConfig.preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleChangeSpacedPreset(key)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                      active
                        ? 'border-[#146C43] bg-[#E8F3EC] text-[#0B3321]'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div>
                      <p className="text-xs sm:text-sm font-bold">{preset.label}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{preset.description}</p>
                    </div>
                    <RefreshCw className={`w-4 h-4 shrink-0 mt-0.5 ${active ? 'text-[#146C43]' : 'text-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Conta, Sincronização e Alertas"
            subtitle="Acesse de qualquer celular ou computador sem perder o histórico"
          >
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F5F7F6] border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isGuest && !user ? (
                    <Smartphone className="w-5 h-5 text-amber-700 shrink-0" />
                  ) : (
                    <Cloud className="w-5 h-5 text-[#146C43] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">
                      {isGuest && !user ? 'Modo Visitante (Local)' : profile?.displayName || user?.email}
                    </p>
                    <p className="text-slate-600 truncate">
                      {isGuest && !user
                        ? 'Salvo neste dispositivo. Entre para sincronizar na nuvem.'
                        : `Sincronização Firebase ativa · ${user?.email || ''}`}
                    </p>
                  </div>
                </div>
                {isGuest && !user ? (
                  <button
                    type="button"
                    onClick={exitGuestMode}
                    className="min-h-[40px] px-3.5 py-2 bg-[#0B3321] text-white font-semibold rounded-xl inline-flex items-center gap-1.5 shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Fazer Login</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 text-slate-900 font-semibold rounded-xl inline-flex items-center gap-1.5 shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('schedule')}
                  className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-200 hover:border-[#0B3321] rounded-xl font-semibold text-slate-800 inline-flex items-center gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5 text-[#146C43]" />
                  <span>Alertas de Estudo (WhatsApp / E-mail)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('family')}
                  className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-200 hover:border-[#0B3321] rounded-xl font-semibold text-slate-800 inline-flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5 text-[#146C43]" />
                  <span>Acesso Familiar e Compartilhado</span>
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
