import { useEffect, useState } from 'preact/hooks';
import { manifest, type Manifest } from '../data';
import { settings, annotations, refreshAnnotations, showToast, history, type Theme } from '../store';
import { ann, kv, persist, type Annotation } from '../db';
import { loadSrs, saveSrs } from '../srs';
import { fmtDate } from './Home';
import { voices, speechPrefs, setSpeechPrefs, supported as canSpeak, play, stop, bestVoice, isRobotic } from '../speech';
import { AI_VOICES, aiPrefs, setAiPrefs, aiStatus, loadAi, unloadAi, removeAiVoice, unlockAudio, gpuAvailable, DOWNLOAD_MB } from '../ai-voice';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'Match iPad' }, { id: 'light', label: 'Light' }, { id: 'sepia', label: 'Sepia' }, { id: 'dark', label: 'Dark' }, { id: 'night', label: 'Night red' },
];

export function SettingsView() {
  const s = settings.value;
  const [m, setM] = useState<Manifest | null>(null);
  const [usage, setUsage] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    manifest().then(setM);
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage || 0) / 1e6).toFixed(0)} MB used on this iPad`));
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const set = (p: Partial<typeof s>) => (settings.value = { ...s, ...p });
  const [vlist, setVlist] = useState<SpeechSynthesisVoice[]>(canSpeak ? voices() : []);
  const [sp, setSp] = useState(speechPrefs());
  useEffect(() => {
    if (!canSpeak) return;
    const on = () => setVlist(voices());
    speechSynthesis.addEventListener('voiceschanged', on);
    return () => speechSynthesis.removeEventListener('voiceschanged', on);
  }, []);
  const setSpeech = (p: Partial<typeof sp>) => { setSpeechPrefs(p); setSp(speechPrefs()); };
  const [ai, setAiState] = useState(aiPrefs());
  const setAi = (p: Parameters<typeof setAiPrefs>[0]) => { setAiPrefs(p); setAiState(aiPrefs()); };
  const st = aiStatus.value;
  useEffect(() => { if (st.state === 'ready') setAiState(aiPrefs()); }, [st.state]);

  const exportBackup = async () => {
    const data = { app: 'far-aim', version: 1, exported: new Date().toISOString(), annotations: annotations.value, history: history.value, flashcards: await loadSrs() };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `far-aim-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    kv.set('lastBackup', Date.now());
    showToast('Backup saved. Keep it in Files or iCloud Drive.');
  };
  const importBackup = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'far-aim' || !Array.isArray(data.annotations)) throw new Error('not a backup');
      let n = 0;
      for (const a of data.annotations as Annotation[]) { await ann.put(a); n++; }
      if (data.flashcards) await saveSrs({ ...(await loadSrs()), ...data.flashcards });
      await refreshAnnotations();
      showToast(`Restored ${n} items from the backup`);
    } catch {
      showToast("That file isn't a FAR/AIM backup.");
    }
  };

  return (
    <div class="settings">
      <header class="pane-head"><h1>Settings</h1></header>

      <section class="block">
        <h2>Reading</h2>
        <div class="field"><span class="field-l">Theme</span>
          <div class="filters wrap">{THEMES.map((t) => <button class={'seg' + (s.theme === t.id ? ' on' : '')} aria-pressed={s.theme === t.id} onClick={() => set({ theme: t.id })}>{t.label}</button>)}</div>
        </div>
        <div class="field"><span class="field-l">Typeface</span>
          <div class="filters">
            <button class={'seg' + (s.font === 'serif' ? ' on' : '')} onClick={() => set({ font: 'serif' })}>Source Serif</button>
            <button class={'seg' + (s.font === 'hyper' ? ' on' : '')} onClick={() => set({ font: 'hyper' })}>Atkinson Hyperlegible</button>
          </div>
        </div>
        <label class="field"><span class="field-l">Text size <b>{s.size}</b></span>
          <input type="range" min="14" max="28" value={s.size} onInput={(e) => set({ size: +(e.target as HTMLInputElement).value })} /></label>
        <label class="field"><span class="field-l">Line spacing <b>{s.lineHeight.toFixed(2)}</b></span>
          <input type="range" min="1.3" max="2" step="0.05" value={s.lineHeight} onInput={(e) => set({ lineHeight: +(e.target as HTMLInputElement).value })} /></label>
        <p class="preview-text" style={{ fontSize: s.size + 'px', lineHeight: s.lineHeight }}>(a) No person may operate an aircraft under VFR when the flight visibility is less than that prescribed.</p>
      </section>

      <section class="block">
        <h2>Read aloud</h2>
        <div class="field"><span class="field-l">Voice engine</span>
          <div class="filters wrap">
            <button class={'seg' + (sp.engine === 'ai' ? ' on' : '')} aria-pressed={sp.engine === 'ai'} onClick={() => setSpeech({ engine: 'ai' })}>Natural AI voice</button>
            {canSpeak && <button class={'seg' + (sp.engine === 'system' ? ' on' : '')} aria-pressed={sp.engine === 'system'} onClick={() => { setSpeech({ engine: 'system' }); }}>iPad voice</button>}
          </div>
        </div>

        {sp.engine === 'ai' && (
          <div class="ai-box">
            {!ai.installed && st.state !== 'loading' && (
              <>
                <p>A neural voice that runs on this iPad and sounds like a real narrator. It downloads once, then works offline.</p>
                <div class="filters wrap">
                  <button class={'seg' + (ai.mode === 'cpu' ? ' on' : '')} onClick={() => setAi({ mode: 'cpu' })}>Standard ({DOWNLOAD_MB.cpu} MB)</button>
                  {gpuAvailable && <button class={'seg' + (ai.mode === 'gpu' ? ' on' : '')} onClick={() => setAi({ mode: 'gpu' })}>Faster, uses the GPU ({DOWNLOAD_MB.gpu} MB)</button>}
                </div>
                <button class="btn" onClick={() => { unlockAudio(); loadAi(ai.mode).then(() => setAiState(aiPrefs())).catch(() => {}); }}>Download the AI voice</button>
                <p class="muted small">Use Wi-Fi. Keep this screen open until it finishes.</p>
              </>
            )}
            {st.state === 'loading' && (
              <div class="dl">
                <p>Downloading and preparing the voice… {st.pct}%</p>
                <div class="bar"><span style={{ width: st.pct + '%' }} /></div>
              </div>
            )}
            {st.state === 'error' && <p class="err">The voice couldn't load: {st.error}. Check the connection and try again.</p>}
            {ai.installed && st.state !== 'loading' && (
              <>
                <label class="field"><span class="field-l">Voice</span>
                  <select class="select" value={ai.voice} onChange={(e) => setAi({ voice: (e.target as HTMLSelectElement).value })}>
                    {AI_VOICES.map((v) => <option value={v.id}>{v.name}, {v.desc}</option>)}
                  </select>
                </label>
                {st.rtf != null && (
                  <p class={'muted small' + (st.rtf > 0.85 ? ' warn' : '')}>
                    Speed check: this iPad makes speech {st.rtf < 1 ? `${(1 / st.rtf).toFixed(1)}× faster than` : `${st.rtf.toFixed(1)}× slower than`} it plays.
                    {st.rtf > 0.85 && ai.mode === 'cpu' && gpuAvailable && ' Try the faster GPU version below to avoid pauses.'}
                  </p>
                )}
                <div class="row-actions">
                  {gpuAvailable && ai.mode === 'cpu' && <button class="btn ghost" onClick={() => { unloadAi(); setAi({ mode: 'gpu', installed: false }); }}>Switch to the faster GPU version</button>}
                  {ai.mode === 'gpu' && <button class="btn ghost" onClick={() => { unloadAi(); setAi({ mode: 'cpu', installed: false }); }}>Switch to the standard version</button>}
                  <button class="btn ghost danger" onClick={async () => { await removeAiVoice(); setAiState(aiPrefs()); showToast('AI voice removed from this iPad'); }}>Remove</button>
                </div>
              </>
            )}
          </div>
        )}

        {sp.engine === 'system' && canSpeak && (
          <>
            <label class="field"><span class="field-l">iPad voice</span>
              <select class="select" value={sp.voice} onChange={(e) => setSpeech({ voice: (e.target as HTMLSelectElement).value })}>
                <option value="">Automatic{bestVoice() ? ` (${bestVoice()!.name})` : ''}</option>
                {vlist.filter((v) => !isRobotic(v)).map((v) => <option value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </label>
            {!vlist.some((v) => /premium|enhanced/i.test(v.name)) && (
              <div class="tip-box">
                <p><b>Better iPad voice:</b> download a Premium voice once (free, about 300 MB).</p>
                <ol>
                  <li>Open the iPad's Settings app, then Accessibility, then Spoken Content (in some versions, Read &amp; Speak).</li>
                  <li>Tap Voices, then English, pick Ava, Zoe or Evan and download Premium.</li>
                  <li>Close this app completely, open it again and choose that voice here.</li>
                </ol>
              </div>
            )}
          </>
        )}

        <label class="field"><span class="field-l">Speed <b>{sp.rate}×</b></span>
          <input type="range" min="0.6" max="2" step="0.1" value={sp.rate} onInput={(e) => setSpeech({ rate: +(e.target as HTMLInputElement).value })} /></label>
        <label class="toggle left"><input type="checkbox" checked={sp.next} onChange={(e) => setSpeech({ next: (e.target as HTMLInputElement).checked })} /> Keep reading into the next section</label>
        <div class="row-actions">
          <button class="btn ghost" disabled={sp.engine === 'ai' && !ai.installed} onClick={() => {
            const el = document.querySelector('.preview-text') as HTMLElement;
            play('settings', [{ el, text: el.textContent || '' }], 0, () => stop());
          }}>Try this voice</button>
        </div>
        <p class="muted small">Reading stops if the iPad locks.</p>
      </section>

      <section class="block">
        <h2>Keyboard shortcuts</h2>
        <dl class="keys">
          <dt>⌘K or /</dt><dd>Search</dd>
          <dt>⌘F</dt><dd>Find in this section</dd>
          <dt>← →</dt><dd>Previous and next section</dd>
          <dt>⌘[</dt><dd>Back</dd>
          <dt>R</dt><dd>Read aloud, pause, resume</dd>
          <dt>B</dt><dd>Bookmark</dd>
          <dt>Space, 1 to 4</dt><dd>Flip and grade a flashcard</dd>
          <dt>Esc</dt><dd>Close</dd>
        </dl>
      </section>

      <section class="block">
        <h2>Backup</h2>
        <p>Highlights, notes and bookmarks live only on this iPad. Save a backup now and then, especially before deleting the app.</p>
        <div class="row-actions">
          <button class="btn" onClick={exportBackup}>Save backup file</button>
          <label class="btn ghost file-btn">Restore from file<input type="file" accept="application/json,.json" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importBackup(f); }} /></label>
        </div>
        <p class="muted">{annotations.value.length} items saved. {usage}</p>
        {persisted === false && <button class="linkish small" onClick={async () => setPersisted(await persist())}>Ask iPadOS to keep this data</button>}
      </section>

      <section class="block">
        <h2>Updates</h2>
        {m && (
          <>
            <p>Regulations current as of {fmtDate(m.sources.far.asOf)}. AIM and Glossary effective {fmtDate(m.sources.aim.effective)} ({m.sources.aim.change}).</p>
            <p class="muted">The server checks the eCFR every night and the FAA site every week. Your iPad picks up new text the next time you open the app with a connection.</p>
          </>
        )}
        <button class="btn ghost" onClick={async () => {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.update();
          showToast(reg?.waiting || reg?.installing ? 'Downloading the update…' : 'You have the latest text.');
        }}>Check for updates now</button>
      </section>

      <section class="block about">
        <h2>About</h2>
        <p>This is a personal, unofficial copy of 14 CFR, 49 CFR Part 830, the Aeronautical Information Manual and the Pilot/Controller Glossary, built from the eCFR and FAA websites. It can lag behind or contain parsing errors. Check the official text before relying on it.</p>
        <p class="muted">No accounts, no tracking. Everything you add stays on this device.</p>
      </section>
    </div>
  );
}
