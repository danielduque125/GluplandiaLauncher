import { useEffect, useRef, useState } from 'react';
import './App.css';

const api = window.gluplandia;

const SOUND_PATHS = {
  hover: ['./sounds/hover_dungeon_1.ogg', './sounds/hover_dungeon_2.ogg'],
  click: ['./sounds/click_dungeon_1.ogg', './sounds/click_dungeon_2.ogg'],
  tab: ['./sounds/tab_dungeon_1.ogg', './sounds/tab_dungeon_2.ogg'],
  scroll: ['./sounds/scroll_dungeon_1.ogg', './sounds/scroll_dungeon_2.ogg'],
  toggle: ['./sounds/toggle_dungeon_1.ogg', './sounds/toggle_dungeon_2.ogg'],
  playButton: ['./sounds/play_button_skill_level_up.ogg'],
  portal: ['./sounds/launch_level_up_user.ogg'],
  success: ['./sounds/success_dungeon_master.ogg'],
  error: ['./sounds/error_dungeon_master.ogg']
};

const PHASE_LABELS = {
  java: 'FORJANDO EL RUNTIME',
  'java-download': 'DESCARGANDO JAVA',
  minecraft: 'PREPARANDO MINECRAFT',
  'minecraft-download': 'DESCARGANDO MINECRAFT',
  assets: 'REUNIENDO RECURSOS',
  pack: 'VERIFICANDO MODPACK',
  'pack-download': 'ACTUALIZANDO MODPACK',
  'repair-ready': 'INSTALACIÓN VERIFICADA',
  'game-launching': 'INICIANDO MINECRAFT',
  'game-ready': 'PORTAL ABIERTO',
  'game-started': 'PORTAL ABIERTO',
  'game-exit': 'AVENTURA FINALIZADA',
  'update-checking': 'COMPROBANDO LAUNCHER',
  'update-available': 'NUEVA VERSIÓN ENCONTRADA',
  'update-progress': 'ACTUALIZANDO LAUNCHER',
  'update-ready': 'ACTUALIZACIÓN LISTA',
  'update-installing': 'INSTALANDO ACTUALIZACIÓN'
};

const DOWNLOAD_STEPS = [
  { id: 'java', label: 'Java' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'assets', label: 'Recursos' },
  { id: 'pack', label: 'Modpack' },
  { id: 'ready', label: 'Listo' }
];

function storedNumber(key, fallback) {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function humanBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(value > 10 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function humanDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function launchClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function phaseStep(phase, busy, running) {
  if (running || phase === 'game-ready' || phase === 'game-started' || phase === 'game-launching' || phase === 'repair-ready') return 4;
  if (phase?.startsWith('java')) return 0;
  if (phase?.startsWith('minecraft')) return 1;
  if (phase === 'assets') return 2;
  if (phase?.startsWith('pack')) return 3;
  return busy ? 0 : -1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function App() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchStartedAt, setLaunchStartedAt] = useState(null);
  const [launchSeconds, setLaunchSeconds] = useState(0);
  const [error, setError] = useState('');
  const [event, setEvent] = useState({ message: 'Preparando tu próxima aventura.' });
  const [logs, setLogs] = useState([]);
  const [content, setContent] = useState({ maintenance: { enabled: false } });
  const [status, setStatus] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [memoryGB, setMemoryGB] = useState(4);
  const [optionalIds, setOptionalIds] = useState([]);
  const [tab, setTab] = useState('aventura');
  const [portalBurst, setPortalBurst] = useState(false);
  const [launchAudioActive, setLaunchAudioActive] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [transfer, setTransfer] = useState(null);
  const [onboarding, setOnboarding] = useState(() => window.localStorage.getItem('gluplandia.onboarding.v2') !== 'done');
  const [musicEnabled, setMusicEnabled] = useState(() => window.localStorage.getItem('gluplandia.music') !== 'off');
  const [sfxEnabled, setSfxEnabled] = useState(() => window.localStorage.getItem('gluplandia.sfx') !== 'off');
  const [musicVolume, setMusicVolume] = useState(() => storedNumber('gluplandia.musicVolume', 0.11));
  const [sfxVolume, setSfxVolume] = useState(() => storedNumber('gluplandia.sfxVolume', 0.18));
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [serverSkin, setServerSkin] = useState({ state: 'idle', skinUrl: null, online: false });
  const [closeGuard, setCloseGuard] = useState(null);
  const [closeGuardPending, setCloseGuardPending] = useState(false);

  const musicRef = useRef(null);
  const soundsRef = useRef({});
  const musicFadeRef = useRef(0);
  const hoverAtRef = useRef(0);
  const scrollAtRef = useRef(0);
  const controlAtRef = useRef(0);
  const soundCursorRef = useRef({});
  const transferRef = useRef(null);

  useEffect(() => {
    const music = new Audio('./sounds/halls_of_the_iron_deep_intro.ogg');
    // Banda sonora continua del launcher. Al terminar vuelve a comenzar automáticamente.
    music.loop = true;
    music.preload = 'auto';
    music.volume = 0;
    musicRef.current = music;
    soundsRef.current = Object.fromEntries(Object.entries(SOUND_PATHS).map(([key, sources]) => {
      const bank = (Array.isArray(sources) ? sources : [sources]).map(src => {
        const audio = new Audio(src);
        audio.preload = 'auto';
        return audio;
      });
      return [key, bank];
    }));

    const unlock = () => {
      if (musicEnabled && !running) music.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      cancelAnimationFrame(musicFadeRef.current);
      music.pause();
      musicRef.current = null;
      soundsRef.current = {};
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem('gluplandia.music', musicEnabled ? 'on' : 'off');
    window.localStorage.setItem('gluplandia.musicVolume', String(musicVolume));
    const audio = musicRef.current;
    if (!audio) return;
    cancelAnimationFrame(musicFadeRef.current);
    const shouldPlay = musicEnabled && !running && !launchAudioActive;
    // La intro permanece claramente audible durante la preparación y las descargas.
    // Solo se desvanece cuando Minecraft realmente arranca.
    const target = shouldPlay ? musicVolume * (busy ? 0.90 : 1) : 0;
    if (shouldPlay && audio.paused) audio.play().catch(() => {});
    const from = audio.volume;
    const started = performance.now();
    const duration = running ? 1000 : 700;
    const step = now => {
      const k = Math.min(1, (now - started) / duration);
      audio.volume = clamp(from + (target - from) * (1 - Math.pow(1 - k, 3)), 0, 1);
      if (k < 1) musicFadeRef.current = requestAnimationFrame(step);
      else if (!shouldPlay) audio.pause();
    };
    musicFadeRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(musicFadeRef.current);
  }, [musicEnabled, musicVolume, running, busy, launchAudioActive]);

  useEffect(() => {
    window.localStorage.setItem('gluplandia.sfx', sfxEnabled ? 'on' : 'off');
    window.localStorage.setItem('gluplandia.sfxVolume', String(sfxVolume));
  }, [sfxEnabled, sfxVolume]);


  useEffect(() => {
    let cancelled = false;
    setAvatarFailed(false);
    if (!profile?.name) {
      setServerSkin({ state: 'idle', skinUrl: null, online: false });
      return () => { cancelled = true; };
    }
    setServerSkin({ state: 'loading', skinUrl: null, online: false });
    api.skin(profile.name).then(result => {
      if (cancelled) return;
      setServerSkin({
        state: result?.hasSkin && result?.skinUrl ? 'ready' : 'missing',
        skinUrl: result?.skinUrl || null,
        online: result?.online === true
      });
    }).catch(() => {
      if (!cancelled) setServerSkin({ state: 'unavailable', skinUrl: null, online: false });
    });
    return () => { cancelled = true; };
  }, [profile?.name]);

  function playSfx(name, level = 1) {
    if (!sfxEnabled) return;
    const bank = soundsRef.current[name];
    if (!Array.isArray(bank) || !bank.length) return;
    const nextIndex = ((soundCursorRef.current[name] ?? -1) + 1) % bank.length;
    soundCursorRef.current[name] = nextIndex;
    const audio = bank[nextIndex].cloneNode();
    audio.volume = clamp(sfxVolume * level, 0, 1);
    audio.play().catch(() => {});
  }

  useEffect(() => {
    const hover = pointerEvent => {
      const interactive = pointerEvent.target.closest?.('button, a[href], input[type="checkbox"], input[type="range"], [role="button"]');
      if (!interactive || interactive.disabled || (pointerEvent.relatedTarget && interactive.contains(pointerEvent.relatedTarget))) return;
      const now = performance.now();
      if (now - hoverAtRef.current < 220) return;
      hoverAtRef.current = now;
      playSfx('hover', 0.10);
    };

    const click = clickEvent => {
      const interactive = clickEvent.target.closest?.('button, a[href], input[type="checkbox"], [role="button"]');
      if (!interactive || interactive.disabled || interactive.classList?.contains('play')) return;
      if (interactive.matches?.('input[type="checkbox"]')) {
        playSfx('toggle', 0.28);
        return;
      }
      playSfx(interactive.closest('nav') ? 'tab' : 'click', interactive.closest('nav') ? 0.24 : 0.34);
    };

    const wheel = wheelEvent => {
      if (Math.abs(wheelEvent.deltaY) < 8 && Math.abs(wheelEvent.deltaX) < 8) return;
      const now = performance.now();
      if (now - scrollAtRef.current < 190) return;
      scrollAtRef.current = now;
      playSfx('scroll', 0.075);
    };

    const control = inputEvent => {
      if (!inputEvent.target.matches?.('input[type="range"]')) return;
      const now = performance.now();
      if (now - controlAtRef.current < 95) return;
      controlAtRef.current = now;
      playSfx('toggle', 0.12);
    };

    document.addEventListener('pointerover', hover);
    document.addEventListener('click', click);
    document.addEventListener('wheel', wheel, { passive: true });
    document.addEventListener('input', control);
    return () => {
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('click', click);
      document.removeEventListener('wheel', wheel);
      document.removeEventListener('input', control);
    };
  }, [sfxEnabled, sfxVolume]);

  useEffect(() => { if (error) playSfx('error', 0.38); }, [error]);
  useEffect(() => { setAvatarFailed(false); }, [profile?.name, profile?.uuid]);

  useEffect(() => {
    if (!api) {
      setError('Abre esta interfaz desde la aplicación Electron.');
      return;
    }

    let active = true;
    const updateTransfer = incoming => {
      if (!Number.isFinite(incoming.received)) {
        if (!String(incoming.phase || '').includes('download')) setTransfer(null);
        return;
      }
      const now = performance.now();
      const key = `${incoming.phase || ''}:${incoming.file || ''}`;
      const previous = transferRef.current;
      let speed = 0;
      if (previous?.key === key && incoming.received >= previous.received && now > previous.time) {
        const instant = (incoming.received - previous.received) / ((now - previous.time) / 1000);
        speed = previous.speed ? previous.speed * 0.68 + instant * 0.32 : instant;
      }
      transferRef.current = { key, received: incoming.received, time: now, speed };
      const eta = Number.isFinite(incoming.total) && incoming.total > incoming.received && speed > 1
        ? (incoming.total - incoming.received) / speed
        : null;
      setTransfer({ speed, eta, file: incoming.file || '' });
    };

    const unsubscribeCloseGuard = api.onCloseGuard?.(incoming => {
      setCloseGuardPending(false);
      setCloseGuard(incoming);
      playSfx(incoming?.kind === 'game' ? 'tab' : 'error', incoming?.kind === 'game' ? 0.22 : 0.18);
    });

    const unsubscribe = api.onEvent(incoming => {
      updateTransfer(incoming);
      if (incoming.phase === 'game-exit') {
        setRunning(false);
        setLaunching(false);
        setLaunchStartedAt(null);
        setLaunchSeconds(0);
        setLaunchAudioActive(false);
        setCloseGuard(current => current?.kind === 'game' ? null : current);
        setCloseGuardPending(false);
      }
      if (incoming.phase === 'game-launching') {
        setRunning(false);
        setLaunching(true);
        setLaunchStartedAt(current => current || incoming.startedAt || Date.now());
      }
      if (incoming.phase === 'game-ready' || incoming.phase === 'game-started') {
        // El efecto especial ya no se dispara al crear java.exe.
        // Espera a que exista una ventana de Minecraft o a un hito tardío del cliente.
        setLaunching(false);
        setLaunchAudioActive(true);
        playSfx('portal', 1.05);
        setPortalBurst(true);
        window.setTimeout(() => setPortalBurst(false), 950);
        setRunning(true);
      }
      if (incoming.phase === 'update-ready') setUpdateReady(true);
      if (incoming.phase === 'game-log') setLogs(previous => [...previous, incoming.message].slice(-120));
      else if (incoming.phase !== 'idle') setEvent(incoming);
    });

    api.initial().then(initial => {
      if (!active) return;
      setData(initial);
      setProfile(initial.profile);
      setName(initial.profile?.name || '');
      setMemoryGB(initial.settings.memoryGB);
      setOptionalIds(initial.settings.optionalIds);
      setSystemInfo(initial.systemInfo || null);
      if (initial.packError) setError(initial.packError);
    }).catch(e => setError(e.message));

    const loadContent = () => api.content().then(value => {
      if (active) setContent(value);
    }).catch(() => {});
    loadContent();

    const pollStatus = () => api.status().then(value => {
      if (active) setStatus(value);
    }).catch(() => {
      if (active) setStatus({ online: false });
    });
    pollStatus();

    const statusTimer = setInterval(pollStatus, 30000);
    const contentTimer = setInterval(loadContent, 300000);
    return () => {
      active = false;
      unsubscribe();
      unsubscribeCloseGuard?.();
      clearInterval(statusTimer);
      clearInterval(contentTimer);
    };
  }, []);

  useEffect(() => {
    if (tab !== 'equipo' || !api) return;
    api.diagnostics().then(setSystemInfo).catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (!launching || !launchStartedAt) {
      if (!launching) setLaunchSeconds(0);
      return undefined;
    }
    const tick = () => setLaunchSeconds(Math.max(0, Math.floor((Date.now() - launchStartedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [launching, launchStartedAt]);

  useEffect(() => {
    if (!closeGuard) return undefined;
    const onKeyDown = keyboardEvent => {
      if (keyboardEvent.key === 'Escape' && !closeGuardPending) {
        keyboardEvent.preventDefault();
        setCloseGuard(null);
        api.closeResponse?.('stay').catch(() => {});
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeGuard, closeGuardPending]);

  async function resolveCloseGuard(actionName) {
    if (closeGuardPending) return;

    if (actionName === 'stay') {
      setCloseGuard(null);
      api.closeResponse?.('stay').catch(() => {});
      return;
    }

    if (actionName === 'minimize') {
      setCloseGuard(null);
      await api.closeResponse?.('minimize').catch(e => setError(e.message));
      return;
    }

    if (actionName === 'cancel-and-close') {
      setCloseGuardPending(true);
      setError('');
      try {
        const result = await api.closeResponse('cancel-and-close');
        if (result?.reason === 'game-running') {
          setCloseGuardPending(false);
          setCloseGuard({
            kind: 'game',
            ready: running,
            eyebrow: running ? 'AVENTURA EN CURSO' : 'PORTAL ABRIÉNDOSE',
            title: running ? 'Minecraft ya está abierto' : 'Minecraft todavía se está iniciando',
            message: running ? 'La preparación terminó y tu aventura comenzó.' : 'Java y Fabric continúan preparando el cliente.',
            detail: running
              ? 'Cierra Minecraft de forma normal antes de abandonar Gluplandia.'
              : 'Espera a que aparezca la ventana del juego o minimiza el launcher.'
          });
        } else if (result?.reason === 'operation-still-running') {
          setCloseGuardPending(false);
          setCloseGuard(current => current ? {
            ...current,
            title: 'La operación todavía está cerrándose',
            message: 'Gluplandia está esperando a que termine una tarea segura.',
            detail: 'Espera unos segundos y vuelve a intentarlo. No se cerrará el launcher a la fuerza.'
          } : current);
        }
      } catch (e) {
        setCloseGuardPending(false);
        setError(e.message);
      }
    }
  }

  async function action(fn) {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await api.preferences({ memoryGB, optionalIds });
  }

  async function launchGame() {
    if (launchDisabled || !profile) return;

    // Feedback inmediato del botón: este efecto es distinto del sonido de arranque real.
    playSfx('playButton', 0.72);
    setPortalBurst(true);
    window.setTimeout(() => setPortalBurst(false), 520);

    // Halls of the Iron Deep continúa sonando mientras Java/Fabric/mods se preparan.
    // El efecto anterior de lanzamiento permanece ligado exclusivamente a game-ready.
    await action(async () => {
      await save();
      await api.play();
      return true;
    });
  }

  async function copyServer() {
    try {
      await api.copyServer();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      playSfx('success', 0.30);
    } catch (e) {
      setError(e.message);
    }
  }

  function finishOnboarding(useRecommended = true) {
    if (useRecommended && systemInfo?.recommendedMemoryGB) setMemoryGB(systemInfo.recommendedMemoryGB);
    window.localStorage.setItem('gluplandia.onboarding.v2', 'done');
    setOnboarding(false);
  }

  const maintenance = Boolean(content.maintenance?.enabled);
  const controlsLocked = busy || launching || running;
  const launchDisabled = controlsLocked || maintenance;
  const progressCurrent = Number.isFinite(event.received) ? event.received : Number.isFinite(event.completed) ? event.completed : null;
  const progressTotal = Number.isFinite(event.total) && event.total > 0 ? event.total : null;
  const progressPercent = progressCurrent !== null && progressTotal
    ? clamp(Math.round(progressCurrent / progressTotal * 100), 0, 100)
    : null;
  const currentStep = phaseStep(event.phase, busy, running);
  const progressMessage = event.message || (event.file
    ? `Descargando ${event.file}`
    : busy
      ? 'Sincronizando la expedición.'
      : launching
        ? 'Fabric está preparando la ventana de Minecraft.'
        : running
          ? 'Minecraft está en ejecución.'
          : 'Todo está listo para cruzar el portal.');
  const progressStage = PHASE_LABELS[event.phase] || (busy ? 'PREPARANDO EL PORTAL' : launching ? 'INICIANDO MINECRAFT' : running ? 'EN LA AVENTURA' : 'PORTAL EN REPOSO');
  const transferText = transfer?.speed > 1
    ? `${humanBytes(transfer.speed)}/s${transfer.eta ? ` · ${humanDuration(transfer.eta)} restantes` : ''}`
    : '';
  const progressDetail = event.file && progressCurrent !== null && progressTotal
    ? `${humanBytes(progressCurrent)} de ${humanBytes(progressTotal)}${transferText ? ` · ${transferText}` : ''}`
    : progressPercent !== null
      ? `${progressCurrent} de ${progressTotal}`
      : busy
        ? 'La primera preparación puede tardar unos minutos.'
        : 'Los archivos se verifican automáticamente antes de jugar.';

  const statusLabel = maintenance
    ? 'Mantenimiento programado'
    : status === null
      ? 'Consultando servidor'
      : status.online
        ? 'El portal está abierto'
        : 'Estado no disponible';

  const skinReady = serverSkin.state === 'ready' && serverSkin.skinUrl && !avatarFailed;
  const skinCaption = serverSkin.state === 'loading'
    ? 'Consultando skin de Gluplandia…'
    : serverSkin.state === 'ready'
      ? 'Skin sincronizada con Gluplandia'
      : serverSkin.state === 'missing'
        ? 'Aún no tienes una skin asignada en Gluplandia'
        : serverSkin.state === 'unavailable'
          ? 'No se pudo consultar la skin del servidor'
          : profile?.mode === 'microsoft' ? 'Cuenta Microsoft conectada' : 'Aventurero local';
  const totalRam = systemInfo?.totalMemoryGB;
  const maxMemory = systemInfo?.maxMemoryGB || 16;
  const recommendedMemory = systemInfo?.recommendedMemoryGB || Math.min(6, maxMemory);

  const renderProgressPanel = (docked = false) => <div className={`launch-status ${busy ? 'active' : ''} ${running || event.phase === 'repair-ready' ? 'ready' : ''} ${docked ? 'download-dock' : ''}`} aria-live="polite">
    <div className="status-rune" aria-hidden="true"><span>✦</span><i/></div>
    <div className="status-body">
      <div className="status-heading"><span>{progressStage}</span><strong>{progressPercent !== null ? `${progressPercent}%` : running ? 'ACTIVO' : busy ? '···' : 'LISTO'}</strong></div>
      <p className="status-message">{progressMessage}</p>
      <div className={`arcane-progress ${progressPercent === null && busy ? 'indeterminate' : ''}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent ?? undefined}><span style={progressPercent !== null ? { width: `${progressPercent}%` } : undefined}/></div>
      <small>{progressDetail}</small>
      <div className="download-steps" aria-hidden="true">
        {DOWNLOAD_STEPS.map((step, index) => <div key={step.id} className={`${index < currentStep ? 'done' : ''} ${index === currentStep ? 'current' : ''}`}><i>{index < currentStep || currentStep === 4 ? '✓' : index + 1}</i><span>{step.label}</span></div>)}
      </div>
    </div>
    {busy && <button className="cancel-operation" onClick={() => api.cancel()}>Cancelar</button>}
  </div>;

  return <div className={`shell ${running ? 'game-running' : ''} ${launching ? 'game-launching' : ''} ${busy ? 'operation-active' : ''}`}>
    <div className="ambient-magic" aria-hidden="true"><i/><i/><i/></div>

    <aside className="sidebar">
      <img className="brand" src="./branding/logo.png" alt="Gluplandia Dungeons"/>
      <div className="edition">JAVA EDITION · WINDOWS</div>

      <nav aria-label="Secciones">
        <button className={tab === 'aventura' ? 'selected' : ''} onClick={() => setTab('aventura')}><span>◈</span> Aventura</button>
        <button className={tab === 'equipo' ? 'selected' : ''} onClick={() => setTab('equipo')}><span>◇</span> Mi equipo</button>
        <button className={tab === 'registro' ? 'selected' : ''} onClick={() => setTab('registro')}><span>≡</span> Registro</button>
      </nav>

      <div className={`server-card ${maintenance ? 'maintenance' : ''}`}>
        <div className="server-card-title"><span className={`dot ${status?.online && !maintenance ? 'online' : ''}`}/><strong>{statusLabel}</strong></div>
        <p>{data?.server || 'play.gluplandia.com'}</p>
        {status?.online && !maintenance && <div className="server-metrics">
          <span>{status.players} / {status.maxPlayers} aventureros</span>
        </div>}
        {maintenance && <small className="server-motd">{content.maintenance?.message || 'Los portales están cerrados mientras trabajamos en Gluplandia.'}</small>}
        <button className="copy-ip" onClick={copyServer}>{copied ? '✓ IP copiada' : 'Copiar IP'}</button>
      </div>

      <button className="site-button" onClick={() => action(() => api.website())}>Visitar Gluplandia ↗</button>
      <button className={`audio-toggle ${musicEnabled ? 'on' : ''}`} onClick={() => setMusicEnabled(value => !value)} aria-pressed={musicEnabled}>{musicEnabled ? '♫ Música ambiental' : '♩ Música pausada'}</button>
      <small className="credits">Gluplandia Dungeons · {data?.launcherVersion || '1.0.0'}<br/>Basado en OpenLauncher · GPL-2.0</small>
    </aside>

    <main>
      <header>
        <div className="header-copy"><span>BIENVENIDO A GLUPLANDIA</span><small>{profile ? `Aventurero · ${profile.name}` : 'Elige tu identidad antes de cruzar el portal'}</small></div>
        <div className="header-pills">
          {status?.online && !maintenance && <span className="live-pill"><i/> ONLINE · {status.players}</span>}
          <span className="version-pill">Minecraft 26.2 · Fabric {data?.pack?.fabricVersion || 'administrado'}</span>
        </div>
      </header>


      {tab === 'aventura' && <div className="tab-scene adventure-scene" key="aventura">
        <section className="hero" style={content.bannerUrl ? { backgroundImage: `linear-gradient(90deg,rgba(9,13,20,.94),rgba(9,13,20,.20)),url("${content.bannerUrl}")` } : undefined}>
          <div className="embers" aria-hidden="true"/>
          <div className="hero-fog" aria-hidden="true"/>
          <div className="hero-copy">
            <span className="eyebrow">{content.heroEyebrow || 'TU GRUPO. TU HISTORIA.'}</span>
            <h1>{content.heroTitle || <>La oscuridad<br/>guarda <em>secretos.</em></>}</h1>
            <p>{content.heroBody || 'Reúne a tus compañeros y cruza el umbral de Gluplandia. Tu próxima aventura comienza aquí.'}</p>
            <div className="hero-meta">
              <span className="pack-label">◈ Modpack {data?.pack?.version || 'pendiente'}</span>
              {data?.pack?.revision && <span className="pack-label subtle">Revisión {data.pack.revision}</span>}
            </div>
          </div>
          <div className="hero-status-card">
            <span className="hero-status-kicker">ESTADO DE LA EXPEDICIÓN</span>
            <strong>{maintenance ? 'Portales cerrados' : status?.online ? `${status.players} aventureros conectados` : 'Preparando conexión'}</strong>
            <small>{status?.version || 'Minecraft Java 26.2'}</small>
          </div>
        </section>

        <section className="launch-panel">
          <div className="account">
            <div className="section-title"><span className="section-rune">◈</span><div><span className="micro-label">IDENTIDAD</span><h2>{profile ? `Hola, ${profile.name}` : 'Elige tu forma de acceso'}</h2></div></div>
            {profile ? <>
              <p>{profile.mode === 'microsoft' ? 'Cuenta Microsoft conectada' : 'Perfil local por nombre de usuario'}</p>
              <div className="profile-chip player-profile-card">
                <div className={`avatar-frame ${serverSkin.state}`}>
                  <span className="avatar-corner tl" aria-hidden="true"/><span className="avatar-corner tr" aria-hidden="true"/><span className="avatar-corner bl" aria-hidden="true"/><span className="avatar-corner br" aria-hidden="true"/>
                  {skinReady ? <div className="server-skin-face" role="img" aria-label={`Rostro de la skin de ${profile.name} en Gluplandia`}>
                    <img className="skin-layer skin-base" src={serverSkin.skinUrl} alt="" onError={() => setAvatarFailed(true)}/>
                    <img className="skin-layer skin-hat" src={serverSkin.skinUrl} alt="" aria-hidden="true"/>
                  </div> : <img className="player-avatar" src="./branding/avatar-fallback.svg" alt={`Avatar de ${profile.name}`}/>}
                  <span className="avatar-plaque" aria-hidden="true">GLU</span>
                </div>
                <div className="player-profile-copy"><span>{profile.mode === 'microsoft' ? 'CUENTA MICROSOFT' : 'AVENTURERO LOCAL'}{serverSkin.online ? ' · EN LÍNEA' : ''}</span><strong>{profile.name}</strong><small>{skinCaption}</small></div>
              </div>
              <button className="text-button" disabled={controlsLocked} onClick={() => action(async () => { await api.logout(); setProfile(null); })}>Cambiar cuenta</button>
            </> : <>
              <button className="microsoft" disabled={controlsLocked} title="Entrar con cuenta Microsoft" aria-label="Entrar con cuenta Microsoft" onClick={() => action(async () => {
                const account = await api.microsoft();
                setProfile(account);
                setEvent({ phase: 'profile-ready', message: 'Cuenta Microsoft conectada correctamente.' });
                playSfx('success', 0.40);
              })}>
                <span className="microsoft-logo" aria-hidden="true"><i/><i/><i/><i/></span>
                Entrar con Microsoft
              </button>
              <form onSubmit={submitEvent => {
                submitEvent.preventDefault();
                action(async () => {
                  setProfile(await api.offline(name));
                  setEvent({ phase: 'profile-ready', message: 'Perfil local guardado.' });
                  playSfx('success', 0.36);
                });
              }}>
                <label htmlFor="name">Acceso local</label>
                <div className="name-row">
                  <input id="name" value={name} onChange={changeEvent => setName(changeEvent.target.value)} placeholder="Nombre de jugador" maxLength={16} pattern="[A-Za-z0-9_]{3,16}" required disabled={controlsLocked}/>
                  <button disabled={controlsLocked || !data}>Usar nombre</button>
                </div>
              </form>
            </>}
            <div className="authme-note"><span>🛡</span><p>Al entrar por primera vez, Gluplandia te pedirá crear una contraseña dentro del juego para proteger tu aventurero.</p></div>
          </div>

          <div className={`launch-actions ${portalBurst ? 'portal-burst' : ''}`}>
            <span className="micro-label">CRUZAR EL UMBRAL</span>
            <button className="play" disabled={launchDisabled || !profile} onClick={launchGame}>
              <span className="play-label">{maintenance ? 'SERVIDOR EN MANTENIMIENTO' : running ? 'EN LA AVENTURA' : launching ? 'INICIANDO MINECRAFT…' : busy ? 'ABRIENDO EL PORTAL…' : 'JUGAR A GLUPLANDIA'}</span>
              <span className="play-sword" aria-hidden="true"><svg viewBox="0 0 32 32" role="presentation"><path d="M23.8 3.9 28 4l-.1 4.2L16.1 20l-4.2-4.2L23.8 3.9Z"/><path d="m10.5 16.8 4.7 4.7-2.1 2.1-1.3-1.3-4 4-2.1-2.1 4-4-1.3-1.3 2.1-2.1Z"/></svg></span>
              <span className="play-sparks" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
            </button>
            <p>{maintenance ? content.maintenance?.message || 'Espera a que el portal vuelva a abrir.' : 'Minecraft, Fabric y el modpack se verifican automáticamente antes de entrar.'}</p>
          </div>

          {!busy && <div className={`launch-readiness ${running ? 'running' : launching ? 'launching' : event.phase === 'repair-ready' ? 'verified' : ''}`} aria-live="polite">
            <span className="readiness-dot" aria-hidden="true"/>
            <div className="readiness-copy">
              <strong>{running ? 'Minecraft está abierto' : launching ? 'Minecraft se está iniciando' : event.phase === 'repair-ready' ? 'Instalación verificada' : 'Listo para jugar'}</strong>
              <small>
                {running
                  ? 'La música del launcher volverá cuando termine la partida.'
                  : launching
                    ? `Fabric está preparando tu aventura · ${launchClock(launchSeconds)}${launchSeconds >= 45 ? ' · El primer arranque con mods puede tardar un poco más.' : ''}`
                    : event.phase === 'repair-ready'
                      ? progressMessage
                      : 'Los archivos se comprobarán automáticamente al cruzar el portal.'}
              </small>
            </div>
            {launching && <div className="launching-orbit" aria-hidden="true"><i/><i/><span>✦</span></div>}
          </div>}
        </section>

      </div>}

      {tab === 'equipo' && <section className="settings tab-scene" key="equipo">
        <span className="eyebrow">PREPARA LA EXPEDICIÓN</span>
        <h1>Mi equipo</h1>
        <p>Estado del launcher, recursos del equipo y preferencias de la instancia administrada de Gluplandia.</p>

        <div className="device-grid">
          <article><span>RAM DEL EQUIPO</span><strong>{totalRam ? `${totalRam} GB` : '—'}</strong><small>Memoria física detectada</small></article>
          <article><span>RAM RECOMENDADA</span><strong>{recommendedMemory} GB</strong><small>Perfil equilibrado para Gluplandia</small></article>
          <article><span>ESPACIO LIBRE</span><strong>{Number.isFinite(systemInfo?.freeDiskGB) ? `${systemInfo.freeDiskGB} GB` : '—'}</strong><small>En la unidad de la instancia</small></article>
          <article><span>MODPACK</span><strong>{systemInfo?.managedVersion || data?.pack?.version || '—'}</strong><small>{systemInfo?.managedFiles ?? data?.pack?.files?.length ?? 0} archivos administrados</small></article>
        </div>

        <div className="settings-card memory-card">
          <div className="settings-card-head"><div><span className="micro-label">RENDIMIENTO</span><h2>Memoria para Minecraft</h2></div><button className="mini-button" disabled={controlsLocked} onClick={() => setMemoryGB(recommendedMemory)}>Usar recomendada</button></div>
          <div className="memory-value"><strong>{memoryGB} GB</strong><span>de hasta {maxMemory} GB disponibles para asignar</span></div>
          <input className="memory-range" id="memory" type="range" min="2" max={maxMemory} step="1" value={memoryGB} disabled={controlsLocked} onChange={changeEvent => setMemoryGB(Number(changeEvent.target.value))}/>
          <div className="memory-scale"><span>2 GB</span><span>Recomendado {recommendedMemory} GB</span><span>{maxMemory} GB</span></div>
        </div>

        <div className="settings-card">
          <span className="micro-label">CONTENIDO</span><h2>Contenido opcional</h2>
          <div className="optional-list">
            {data?.pack?.files.filter(file => !file.required).map(file => <label className="check option-row" key={file.id}><input type="checkbox" checked={optionalIds.includes(file.id)} disabled={controlsLocked} onChange={changeEvent => setOptionalIds(changeEvent.target.checked ? [...optionalIds, file.id] : optionalIds.filter(id => id !== file.id))}/><span><strong>{file.name}</strong><small>Contenido opcional del modpack</small></span></label>)}
            {!data?.pack?.files.some(file => !file.required) && <p>No hay contenido opcional publicado.</p>}
          </div>
          <button disabled={controlsLocked} onClick={() => action(async () => { await save(); setEvent({ phase: 'preferences-ready', message: 'Preferencias guardadas.' }); playSfx('success', 0.34); })}>Guardar preferencias</button>
        </div>

        <div className="settings-card">
          <span className="micro-label">SONIDO</span><h2>Audio del launcher</h2>
          <div className="audio-settings">
            <label className="check"><input type="checkbox" checked={musicEnabled} onChange={changeEvent => setMusicEnabled(changeEvent.target.checked)}/>Música ambiental</label>
            <label>Volumen de música <span>{Math.round(musicVolume * 100)}%</span><input className="audio-range" type="range" min="0" max="0.18" step="0.01" value={musicVolume} onChange={changeEvent => setMusicVolume(Number(changeEvent.target.value))}/></label>
            <label className="check"><input type="checkbox" checked={sfxEnabled} onChange={changeEvent => setSfxEnabled(changeEvent.target.checked)}/>Efectos de interfaz</label>
            <label>Volumen de efectos <span>{Math.round(sfxVolume * 100)}%</span><input className="audio-range" type="range" min="0" max="0.36" step="0.01" value={sfxVolume} onChange={changeEvent => setSfxVolume(Number(changeEvent.target.value))}/></label>
            <p className="audio-note">Halls of the Iron Deep se repite continuamente mientras usas el launcher. Al pulsar JUGAR suena el nuevo efecto de habilidad; cuando Minecraft realmente está listo, la música se desvanece y entra el efecto especial de lanzamiento anterior.</p>
          </div>
        </div>

        <div className="settings-grid-two">
          <div className="settings-card">
            <span className="micro-label">ARCHIVOS</span><h2>Instancia de Gluplandia</h2>
            <p>El launcher protege los archivos administrados y conserva tus archivos personales.</p>
            <div className="folder-buttons"><button onClick={() => action(() => api.folder('root'))}>Abrir instancia</button>{data?.allowUserMods && <button onClick={() => action(() => api.folder('user-mods'))}>Mods personales</button>}<button onClick={() => action(() => api.folder('backups'))}>Copias de seguridad</button></div>
            <button className="repair-button settings-repair" disabled={controlsLocked} onClick={() => action(async () => {
              await save();
              const result = await api.repair();
              setSystemInfo(await api.diagnostics().catch(() => systemInfo));
              setEvent({ phase: 'repair-ready', message: result.changed ? `Reparación completa. ${result.changed} archivo(s) fueron restaurados.` : `Instalación verificada. ${result.files} archivos del modpack están correctos.` });
              playSfx('success', 0.40);
            })}>↻ Verificar instalación</button>
            <code>{data?.root}</code>
          </div>
          <div className="settings-card">
            <span className="micro-label">LAUNCHER</span><h2>Actualizaciones</h2>
            <p>Versión instalada <strong>{data?.launcherVersion || '—'}</strong>. Al iniciar, el launcher comprueba automáticamente GitHub Releases y aplica cualquier versión nueva antes de continuar.</p>
            <button disabled={busy} onClick={() => action(async () => { const result = await api.update(); if (!result.enabled) setEvent({ phase: 'update-disabled', message: 'La comprobación automática solo se ejecuta en la instalación de Windows; no se ejecuta en desarrollo ni en la edición portable.' }); })}>Comprobar actualización</button>
          </div>
        </div>
      </section>}

      {tab === 'registro' && <section className="settings tab-scene" key="registro">
        <span className="eyebrow">DIAGNÓSTICO</span>
        <h1>Registro del juego</h1>
        <p>Los mensajes de Minecraft de la sesión actual aparecen aquí. Los tokens de autenticación se ocultan antes de mostrarse.</p>
        <div className="log-toolbar"><span>{logs.length} entradas recientes</span><button className="mini-button" disabled={!logs.length} onClick={() => setLogs([])}>Limpiar registro</button></div>
        <pre>{logs.join('\n') || 'Minecraft todavía no ha generado mensajes.'}</pre>
      </section>}

      {(event.phase === 'auth-code' || updateReady) && <footer className="status-footer utility-footer" aria-live="polite"><div>{event.phase === 'auth-code' && <strong className="device-code">{event.code}</strong>}<span>{event.phase === 'auth-code' ? event.message : 'Hay una actualización del launcher lista para instalar.'}</span></div>{updateReady && <button disabled={controlsLocked} onClick={() => action(() => api.restart())}>Reiniciar y actualizar</button>}</footer>}
      {error && <div className="error" role="alert"><strong>Algo interrumpió el portal</strong><span>{error}</span></div>}
    </main>

    {busy && renderProgressPanel(true)}

    {closeGuard && <div className="close-guard-backdrop" role="presentation">
      <section
        className={`close-guard-card ${closeGuard.kind === 'game' ? 'game-guard' : 'operation-guard'} ${closeGuardPending ? 'pending' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-guard-title"
        aria-describedby="close-guard-description"
      >
        <div className="close-guard-glow" aria-hidden="true"/>
        <div className="close-guard-runes" aria-hidden="true"><i>ᛉ</i><i>ᚱ</i><i>ᛏ</i></div>
        <div className="close-guard-emblem" aria-hidden="true">
          <span>{closeGuard.kind === 'game' ? '⚔' : '✦'}</span>
          <i/>
        </div>

        <div className="close-guard-copy">
          <span className="close-guard-eyebrow">{closeGuard.eyebrow}</span>
          <h2 id="close-guard-title">{closeGuard.title}</h2>
          <p id="close-guard-description">{closeGuard.message}</p>
          <small>{closeGuardPending ? 'Cancelando la operación de forma segura…' : closeGuard.detail}</small>
        </div>

        {closeGuard.kind === 'operation' ? <div className="close-guard-actions">
          <button
            className="close-guard-secondary"
            disabled={closeGuardPending}
            onClick={() => resolveCloseGuard('stay')}
          >
            Seguir esperando
          </button>
          <button
            className="close-guard-danger"
            disabled={closeGuardPending}
            onClick={() => resolveCloseGuard('cancel-and-close')}
          >
            <span>{closeGuardPending ? 'CERRANDO PORTAL…' : 'CANCELAR Y SALIR'}</span>
            <b aria-hidden="true">×</b>
          </button>
        </div> : <div className="close-guard-actions">
          <button
            className="close-guard-secondary"
            disabled={closeGuardPending}
            onClick={() => resolveCloseGuard('stay')}
          >
            Quedarme aquí
          </button>
          <button
            className="close-guard-primary"
            disabled={closeGuardPending}
            onClick={() => resolveCloseGuard('minimize')}
          >
            <span>{closeGuard.ready === false ? 'MINIMIZAR LAUNCHER' : 'VOLVER A MINECRAFT'}</span>
            <b aria-hidden="true">↗</b>
          </button>
        </div>}

        <div className="close-guard-foot">
          <span className={`close-guard-status ${closeGuard.kind}`}>
            <i/>
            {closeGuard.kind === 'game' ? 'Minecraft en ejecución' : closeGuardPending ? 'Cancelación segura en curso' : 'Archivos en movimiento'}
          </span>
          <span>ESC para volver</span>
        </div>
      </section>
    </div>}

    {onboarding && data && <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="onboarding-card">
        <button className="onboarding-close" aria-label="Cerrar introducción" onClick={() => finishOnboarding(false)}>×</button>
        <img src="./branding/logo.png" alt=""/>
        <span className="eyebrow">PRIMERA EXPEDICIÓN</span>
        <h2 id="onboarding-title">Tu portal está listo.</h2>
        <p>El launcher se encargará de Java, Minecraft, Fabric y el modpack. Tú solo eliges tu identidad y entras.</p>
        <div className="onboarding-steps">
          <article><i>1</i><div><strong>Identidad protegida</strong><span>Usa tu nombre y AuthMe protegerá tu aventurero dentro del servidor.</span></div></article>
          <article><i>2</i><div><strong>{recommendedMemory} GB recomendados</strong><span>Detectamos {totalRam || 'tu'} GB de RAM y ajustamos una configuración equilibrada.</span></div></article>
          <article><i>3</i><div><strong>Todo se actualiza solo</strong><span>Los archivos del modpack se verifican antes de cada aventura.</span></div></article>
        </div>
        <button className="onboarding-primary" onClick={() => finishOnboarding(true)}>Usar configuración recomendada</button>
        <button className="text-button onboarding-secondary" onClick={() => finishOnboarding(false)}>Mantener mis ajustes</button>
      </section>
    </div>}
  </div>;
}
