import { useEffect, useRef, useState } from 'react';
import ArticulationPanel from './articulation-panel';
import AudioCheck from './audio-check';
import {
  jointCommand,
  articulationBlock,
  jointInput,
  neutralJoints,
  stopArticulation,
  type Joint,
} from '../lib/articulation';
import { Volume2, VolumeX, Maximize, Minimize, HelpCircle, RotateCcw } from 'lucide-react';
import {
  initialState,
  command,
  tick,
  auxiliary,
  serviceCommand,
  startSystemTest,
  startShutdown,
  throttleCommand,
  shutdownActive,
  overheadCommand,
  dcPowerAvailable,
  type MachineState,
} from '../lib/machine';
import { walkInput, idleInput, walkSetting, walkingStopped } from '../lib/walking';
import { hangarCommand } from '../lib/hangar';
import { mobilityCommand, restraintLabel } from '../lib/mobility';
import { serviceWarning, electricalReadings, sourceLabel } from '../lib/service-systems';
import { MachineAudio, type AudioStatus } from '../lib/machine-audio';
import type { CockpitScene, CameraView } from '../lib/cockpit-scene';
/** Text der Statusanzeige oben rechts, nach Dringlichkeit geordnet. */
function statusText(state: MachineState): string {
  if (state.thermalLimited) return 'TEMPERATURSCHUTZ';
  if (state.thermalWarning) return 'TEMPERATURWARNUNG';
  if (serviceWarning(state)) return 'SYSTEMWARNUNG';
  if (shutdownActive(state)) return 'ABSCHALTSEQUENZ';
  if (state.shutdownPhase === 'complete') return 'ABGESCHALTET';
  if (state.stage === 6) return 'SYSTEME ONLINE';
  if (state.busy >= 0) return 'STARTVORGANG';
  if (state.stage) return 'STANDBY';
  if (state.overhead.apuPhase === 'starting') return 'APU START';
  if (dcPowerAvailable(state)) return sourceLabel(electricalReadings(state).source);
  return 'KALTSTART';
}

function statusTone(state: MachineState): '' | 'warning' | 'online' {
  if (state.thermalWarning || serviceWarning(state)) return 'warning';
  if (shutdownActive(state)) return '';
  return state.stage === 6 ? 'online' : '';
}

export default function Cockpit() {
  const container = useRef<HTMLDivElement>(null),
    scene = useRef<CockpitScene | null>(null),
    audio = useRef<MachineAudio | null>(null),
    stateRef = useRef<MachineState>(initialState());
  const [state, setState] = useState(initialState),
    [loaded, setLoaded] = useState(false),
    [failure, setFailure] = useState(''),
    [audioStatus, setAudioStatus] = useState<AudioStatus>('idle'),
    [help, setHelp] = useState(false),
    [full, setFull] = useState(false),
    [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const audioActive = audioStatus === 'active',
    soundLabel = audioActive
      ? 'Ton ausschalten'
      : audioStatus === 'muted'
        ? 'Ton einschalten'
        : audioStatus === 'blocked'
          ? 'Audio blockiert – klicken zum Aktivieren'
          : audioStatus === 'error'
            ? 'Audio nicht verfügbar – erneut versuchen'
            : 'Ton aktivieren';
  const [jointsOpen, setJointsOpen] = useState(false);
  const [audioCheckOpen, setAudioCheckOpen] = useState(false);
  const [night, setNight] = useState(false);
  const [headlights, setHeadlights] = useState(false);
  const [rain, setRain] = useState(false);
  const [armed, setArmed] = useState(false);
  const [laser, setLaser] = useState(false);
  const [weaponInfo, setWeaponInfo] = useState<ReturnType<CockpitScene['weaponInfo']> | null>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const toggleArmed = () =>
    setArmed((v) => {
      scene.current?.setWeaponsArmed(!v);
      return !v;
    });
  const toggleLaser = () =>
    setLaser((v) => {
      scene.current?.setLaser(!v);
      return !v;
    });
  const toggleRain = () =>
    setRain((v) => {
      scene.current?.setRain(!v);
      return !v;
    });
  const toggleNight = () =>
    setNight((v) => {
      scene.current?.setNight(!v);
      return !v;
    });
  const toggleHeadlights = () =>
    setHeadlights((v) => {
      scene.current?.setHeadlights(!v);
      return !v;
    });
  const held = useRef(new Set<string>()),
    helpRef = useRef(false);
  helpRef.current = help;
  const stopInput = () => {
    held.current.clear();
    if (scene.current) scene.current.trigger = false;
    stateRef.current = stopArticulation(walkInput(stateRef.current, idleInput()));
  };
  const [cameraView, setCameraView] = useState<CameraView>('front');
  const changeView = (view: CameraView) => {
    if (!scene.current) return;
    stopInput();
    scene.current.view(view);
    setCameraView(view);
    setHover(null);
  };
  const apply = (next: MachineState) => {
    const previous = stateRef.current;
    stateRef.current = next;
    audio.current?.update(next);
    if (
      (next.thermalWarning && !previous.thermalWarning) ||
      (next.thermalLimited && !previous.thermalLimited)
    )
      audio.current?.beep(true);
    // Telemetry goes straight to the instruments. React only needs chrome/status changes.
    if (
      previous.walk.z < -35 !== next.walk.z < -35 ||
      previous.hangar.gate !== next.hangar.gate ||
      previous.mobility.restraints !== next.mobility.restraints ||
      serviceWarning(previous) !== serviceWarning(next) ||
      electricalReadings(previous).source !== electricalReadings(next).source ||
      previous.stage !== next.stage ||
      previous.busy !== next.busy ||
      previous.message !== next.message ||
      previous.shutdownPhase !== next.shutdownPhase ||
      previous.thermalWarning !== next.thermalWarning ||
      previous.thermalLimited !== next.thermalLimited ||
      previous.overhead.apuPhase !== next.overhead.apuPhase ||
      dcPowerAvailable(previous) !== dcPowerAvailable(next)
    )
      setState(next);
  };
  const sendJoint = (joint: Joint | 'neutral', degrees = 0) => {
    if (scene.current?.inHangar || scene.current?.inYard) {
      apply({
        ...stateRef.current,
        error: true,
        message: 'Gelenke in der Pilotensicht [F] oder Mech-Außenansicht [V] bedienen.',
      });
      return;
    }
    const next = jointCommand(stateRef.current, joint, degrees);
    apply(next);
    void audio.current?.enable().catch(() => {});
    if (next.error) audio.current?.beep(true);
  };
  const operate = useRef<(index: number) => void>(() => {});
  operate.current = (index) => {
    if (
      scene.current?.inHangar ||
      scene.current?.inYard ||
      (scene.current?.inMech && !(index === 95 || index === 96))
    )
      return;
    void audio.current?.enable().catch(() => {});
    if (index >= 100 && index <= 107) {
      scene.current?.cameraAction(index);
      void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index === 95 || index === 96) {
      const previous = stateRef.current,
        next = throttleCommand(previous, index === 95 ? -1 : 1);
      apply(next);
      if (next.error) audio.current?.beep(true);
      else if (next.throttle !== previous.throttle)
        void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index === 93 || index === 94) {
      apply(walkSetting(stateRef.current, index));
      if (index === 94) void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index >= 90 && index <= 92) {
      const next = hangarCommand(stateRef.current, index);
      apply(next);
      if (next.error) audio.current?.beep(true);
      else void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index >= 80) {
      const next = mobilityCommand(stateRef.current, index);
      apply(next);
      if (next.error) audio.current?.beep(true);
      else if (index >= 82) void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index >= 60) {
      const previous = stateRef.current;
      const next = serviceCommand(previous, index);
      apply(next);
      if (next.error && next.service === previous.service) audio.current?.beep(true);
      else if (index >= 63) void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index >= 40) {
      const previous = stateRef.current;
      const next = overheadCommand(previous, index, performance.now());
      apply(next);
      if (next.overhead !== previous.overhead) void audio.current?.playSwitch().catch(() => {});
      if (next.error) audio.current?.beep(true);
      return;
    }
    if (index === 35) {
      const next = startShutdown(stateRef.current);
      apply(next);
      if (next.error) audio.current?.beep(true);
      else void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index === 30) {
      const next = startSystemTest(stateRef.current);
      apply(next);
      if (next.error) audio.current?.beep(true);
      else void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index >= 20) {
      const next = auxiliary(stateRef.current, index);
      apply(next);
      if (next.error) audio.current?.beep(true);
      else void audio.current?.playSwitch().catch(() => {});
      return;
    }
    if (index === 10) {
      const s = stateRef.current;
      if (!s.stage) {
        apply({
          ...s,
          error: true,
          message: 'Für die Kabinenbeleuchtung zuerst Hauptstrom einschalten.',
        });
        return;
      }
      void audio.current?.playSwitch().catch(() => {});
      apply({
        ...s,
        light: !s.light,
        error: false,
        message: s.light
          ? 'Kabinenbeleuchtung ausgeschaltet.'
          : 'Kabinenbeleuchtung eingeschaltet.',
      });
      return;
    }
    if (index === 11) {
      const next = throttleCommand(stateRef.current);
      apply(next);
      audio.current?.beep(next.error);
      return;
    }
    const previous = stateRef.current;
    const next = command(previous, index, performance.now());
    apply(next);
    const moved = next.busy !== previous.busy || next.stage !== previous.stage;
    if (moved) void audio.current?.playSwitch().catch(() => {});
    else if (next.error) audio.current?.beep(true);
  };
  useEffect(() => {
    let stopped = false;
    audio.current = new MachineAudio((status) => {
      if (!stopped) setAudioStatus(status);
    });
    const audioSurface = container.current;
    const unlockAudio = () => {
      const a = audio.current;
      if (a && !a.muted && a.ctx?.state !== 'running') void a.enable().catch(() => {});
    };
    audioSurface?.addEventListener('pointerup', unlockAudio);
    import('../lib/cockpit-scene')
      .then(({ CockpitScene }) => {
        if (stopped || !container.current) return;
        try {
          scene.current = new CockpitScene(
            container.current,
            () => stateRef.current,
            (i) => operate.current(i),
            setHover,
            (boot) => audio.current?.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle),
          );
          // Nur im Entwicklungsmodus: Szene für Experimente in der Browserkonsole.
          scene.current.onThunder = (variant, distance) =>
            audio.current?.thunder(variant, distance);
          scene.current.onGunshot = (cabin) => audio.current?.gunshot(cabin);
          scene.current.onImpact = (kind, distance) => audio.current?.impact(kind, distance);
          if (import.meta.env.DEV)
            (window as unknown as { ironVault?: unknown }).ironVault = {
              scene: scene.current,
              state: stateRef,
            };
          void scene.current.ready
            .then(() => {
              if (!stopped) setLoaded(true);
            })
            .catch(() => {
              if (!stopped)
                setFailure(
                  'Mech-Modell oder Materialien konnten nicht vollständig geladen werden. Bitte lade die Seite erneut.',
                );
            });
        } catch (e) {
          console.error(e);
          setFailure(
            'Die 3D-Ansicht konnte nicht gestartet werden. Aktiviere die Hardwarebeschleunigung deines Browsers und lade die Seite erneut.',
          );
        }
      })
      .catch(() =>
        setFailure('Die 3D-Ansicht konnte nicht geladen werden. Bitte lade die Seite erneut.'),
      );
    const timer = window.setInterval(() => {
      const next = tick(stateRef.current, performance.now());
      if (next !== stateRef.current) {
        const finished =
          (stateRef.current.mobility.calibration !== 'ready' &&
            next.mobility.calibration === 'ready') ||
          (stateRef.current.busy >= 0 && next.busy < 0) ||
          (stateRef.current.testPhase !== 'passed' && next.testPhase === 'passed') ||
          (stateRef.current.shutdownPhase !== next.shutdownPhase &&
            ['isolate', 'complete'].includes(next.shutdownPhase)) ||
          (stateRef.current.overhead.apuPhase !== next.overhead.apuPhase &&
            ['ready', 'running'].includes(next.overhead.apuPhase));
        apply(next);
        if (finished) audio.current?.beep();
      }
    }, 70);
    const movementCodes = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyQ', 'KeyE'];
    const updateInput = () => {
      const keys = held.current;
      apply(
        walkInput(stateRef.current, {
          forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
          turn: Number(keys.has('KeyA')) - Number(keys.has('KeyD')),
          brake: keys.has('Space'),
        }),
      );
      apply(
        jointInput(stateRef.current, {
          ...neutralJoints(),
          torso: Number(keys.has('KeyQ')) - Number(keys.has('KeyE')),
        }),
      );
    };
    const key = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)))
      )
        return;
      if (
        e.code === 'Space' &&
        e.target instanceof HTMLButtonElement &&
        walkingStopped(stateRef.current)
      )
        return;
      if (movementCodes.includes(e.code)) {
        if (helpRef.current || !scene.current || scene.current.inHangar || scene.current.inYard)
          return;
        e.preventDefault();
        if (e.target instanceof HTMLButtonElement) e.target.blur();
        if (e.repeat || held.current.has(e.code)) return;
        held.current.add(e.code);
        updateInput();
        void audio.current?.enable().catch(() => {});
        return;
      }
      if (e.repeat) return;
      if (e.code === 'KeyG' && !helpRef.current) {
        e.preventDefault();
        operate.current(68);
        return;
      }
      if (e.key === 'Escape') {
        stopInput();
        setHelp(false);
        setAudioCheckOpen(false);
        if (scene.current?.inHangar || scene.current?.inYard || scene.current?.inMech)
          changeView('front');
        return;
      }
      if (helpRef.current) return;
      if (e.code === 'KeyB') {
        stopInput();
        setJointsOpen((v) => !v);
        return;
      }
      if (e.code === 'KeyR') {
        sendJoint('neutral');
        return;
      }
      if (e.code === 'KeyV') {
        changeView(scene.current?.inMech ? 'front' : 'mech');
        return;
      }
      if (e.code === 'PageUp' || e.code === 'PageDown') {
        e.preventDefault();
        operate.current(e.code === 'PageUp' ? 96 : 95);
        return;
      }
      if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        operate.current(Number(e.key) - 1);
      }
      if (e.key.toLowerCase() === 'f') changeView('front');
      if (e.key.toLowerCase() === 'o') changeView('overhead');
      if (e.key.toLowerCase() === 'h') changeView(scene.current?.inHangar ? 'front' : 'hangar');
      if (e.key.toLowerCase() === 'u') changeView(scene.current?.inYard ? 'front' : 'yard');
      if (e.key.toLowerCase() === 'l') operate.current(10);
      if (e.key.toLowerCase() === 'n' && !e.repeat) toggleNight();
      if (e.key.toLowerCase() === 'j' && !e.repeat) toggleHeadlights();
      if (e.key.toLowerCase() === 'x' && !e.repeat) toggleRain();
      if (e.key.toLowerCase() === 'm' && !e.repeat) toggleArmed();
      if (e.key.toLowerCase() === 'p' && !e.repeat) toggleLaser();
      if (e.key.toLowerCase() === 't') operate.current(30);
      if (e.key.toLowerCase() === 'k') operate.current(35);
    };
    const keyup = (e: KeyboardEvent) => {
      if (held.current.delete(e.code)) {
        e.preventDefault();
        updateInput();
      }
    };
    const blur = () => stopInput();
    const visibility = () => {
      if (document.hidden) stopInput();
    };
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    const fs = () => setFull(!!document.fullscreenElement);
    window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fs);
    return () => {
      stopped = true;
      audioSurface?.removeEventListener('pointerup', unlockAudio);
      stopInput();
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      clearInterval(timer);
      window.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', fs);
      scene.current?.dispose();
      audio.current?.dispose();
    };
    // Bewusst nur beim Einhängen: Szene, Audio und Tastatur-Listener leben genau einmal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function toggleSound() {
    await audio.current?.toggleSound().catch(() => {});
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      apply({
        ...stateRef.current,
        message:
          'Vollbild ist in dieser Ansicht nicht verfügbar. Öffne die Seite in einem eigenen Browser-Tab.',
        error: true,
      });
    }
  }
  // Waffenstatus mit 10 Hz abfragen; Torso führt nach, wenn das Ziel aus dem Schwenkbereich wandert.
  useEffect(() => {
    if (!armed && !laser) {
      setWeaponInfo(null);
      return;
    }
    const timer = window.setInterval(() => {
      const sc = scene.current;
      if (!sc) return;
      const info = sc.weaponInfo();
      setWeaponInfo(info);
      const current = stateRef.current;
      if (info.armed && info.torsoDemand !== null && !articulationBlock(current)) {
        const next = jointCommand(current, 'torso', info.torsoDemand);
        // Nachführen ohne Meldungsflut im Kommunikationsdisplay.
        if (!next.error)
          stateRef.current = { ...next, message: current.message, error: current.error };
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [armed, laser]);
  // Fadenkreuz folgt der Maus direkt (ohne React-Neuzeichnen pro Mausbewegung).
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (reticle.current)
        reticle.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  // Regengeräusch: in der Kanzel gedämpft, in Außenansichten hell.
  useEffect(() => {
    audio.current?.setRain(rain ? 1 : 0, !['mech', 'hangar', 'yard'].includes(cameraView));
  }, [rain, cameraView, audioStatus]);
  return (
    <main className="cockpit-app">
      <div
        className="scene"
        ref={container}
        aria-label="Interaktive 3D-Pilotenkanzel. Startschritte mit den physischen Schaltern oder den Tasten 1 bis 6 bedienen."
      />
      {!['mech', 'hangar', 'yard'].includes(cameraView) && (
        <div className="cabin-vignette" aria-hidden="true" />
      )}
      {!loaded && !failure && (
        <div className="loading">
          <strong>IRON VAULT</strong>
          <small>Pilotenkanzel und Mech werden geladen …</small>
          <div className="loading-bar" aria-hidden="true" />
        </div>
      )}
      {failure && (
        <div className="error-panel">
          <h2>3D-Ansicht nicht verfügbar</h2>
          <p>{failure}</p>
          <button onClick={() => location.reload()}>Erneut laden</button>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">IV</div>
          <div>
            <h1>IRON VAULT</h1>
            <div className="eyebrow">MK. IV / PILOTENKANZEL</div>
          </div>
        </div>
        <div className="top-right">
          <div className={'status-pill ' + statusTone(state)}>
            <i />
            {statusText(state)}
          </div>
          <div className="toolbar">
            <button
              className="icon-button"
              title={soundLabel}
              aria-label={soundLabel}
              aria-pressed={audioActive}
              onClick={toggleSound}
            >
              {audioActive ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              className="icon-button"
              title="Sicht zurücksetzen [F]"
              aria-label="Sicht zurücksetzen"
              onClick={() => changeView('front')}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-button"
              title="Bedienung"
              aria-label="Bedienung anzeigen"
              aria-expanded={help}
              onClick={() => {
                stopInput();
                setHelp(!help);
              }}
            >
              <HelpCircle size={17} />
            </button>
            <button
              className="icon-button"
              title="Vollbild"
              aria-label="Vollbild umschalten"
              onClick={fullscreen}
            >
              {full ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          </div>
        </div>
      </header>
      {audioCheckOpen && (
        <AudioCheck read={() => audio.current} close={() => setAudioCheckOpen(false)} />
      )}
      <div className="hud">
        <div className="hud-left">
          <div className="mission-tag">
            <strong>
              {cameraView === 'yard' || (cameraView !== 'hangar' && state.walk.z < -35)
                ? 'TESTGELÄNDE 07'
                : 'HANGAR 07'}
            </strong>
            {cameraView === 'mech'
              ? 'IV–04 · AUSSENANSICHT'
              : cameraView === 'yard'
                ? 'AUSSENKAMERA · PRÜFSTRECKE'
                : cameraView === 'hangar'
                  ? 'HALLENKAMERA · WARTUNGSBEREICH'
                  : 'PILOTENSICHT · ' + restraintLabel(state)}
          </div>
          {!audioActive && (
            <button className="audio-notice" onClick={toggleSound}>
              {soundLabel}
            </button>
          )}
        </div>
        <div className="view-presets" aria-label="Kameraansichten">
          <button
            className="joint-toggle"
            aria-expanded={jointsOpen}
            onClick={() => {
              stopInput();
              setJointsOpen((v) => !v);
            }}
          >
            GELENKE [B]
          </button>
          <button
            className="mech-view group-end"
            aria-pressed={cameraView === 'mech'}
            onClick={() => changeView('mech')}
          >
            MECH [V]
          </button>
          <button
            className="hangar-view"
            aria-pressed={cameraView === 'hangar'}
            onClick={() => changeView('hangar')}
          >
            HANGAR [H]
          </button>
          <button
            className="group-end"
            aria-pressed={cameraView === 'yard'}
            onClick={() => changeView('yard')}
          >
            TESTGELÄNDE [U]
          </button>
          <button aria-pressed={cameraView === 'overhead'} onClick={() => changeView('overhead')}>
            OVERHEAD [O]
          </button>
          <button aria-pressed={cameraView === 'left'} onClick={() => changeView('left')}>
            LINKS
          </button>
          <button aria-pressed={cameraView === 'front'} onClick={() => changeView('front')}>
            COCKPIT [F]
          </button>
          <button aria-pressed={cameraView === 'right'} onClick={() => changeView('right')}>
            RECHTS
          </button>
          <button
            className="group-end"
            aria-pressed={cameraView === 'panel'}
            onClick={() => changeView('panel')}
          >
            INSTRUMENTE
          </button>
          <button
            aria-pressed={headlights}
            title={
              dcPowerAvailable(state)
                ? 'Scheinwerfer ein/aus'
                : 'Scheinwerfer brauchen Bordstrom (Batterie, Hangarstrom oder Generator)'
            }
            onClick={toggleHeadlights}
          >
            SCHEINWERFER [J]
          </button>
          <button
            aria-pressed={armed}
            className="weapon-toggle"
            title="Hauptschalter Waffen (MASTER ARM). Feuern: linke Maustaste in der Pilotensicht."
            onClick={toggleArmed}
          >
            WAFFEN [M]
          </button>
          <button aria-pressed={laser} onClick={toggleLaser} title="Laser-Entfernungsmesser">
            LASER [P]
          </button>
          <button aria-pressed={rain} onClick={toggleRain}>
            REGEN [X]
          </button>
          <button aria-pressed={night} onClick={toggleNight}>
            {night ? 'NACHT [N]' : 'TAG [N]'}
          </button>
        </div>
      </div>
      {cameraView === 'mech' && (
        <aside className="mech-inspection" aria-label="Mech-Außenansicht">
          <strong>IV–04 / PILOTENKAPSEL</strong>
          <p>
            Maus ziehen: rundum drehen
            <br />
            Mausrad: Abstand ändern
          </p>
          <div className="mech-angles">
            <button onClick={() => scene.current?.orbitPreset('front')}>Vorne</button>
            <button onClick={() => scene.current?.orbitPreset('side')}>Seite</button>
            <button onClick={() => scene.current?.orbitPreset('rear')}>Hinten</button>
          </div>
          <p>
            WASD: gehen, wenn freigegeben.
            <br />
            Leertaste: Schnellbremse.
          </p>
          <button className="mech-return" onClick={() => changeView('front')}>
            Ins Cockpit [F / V]
          </button>
        </aside>
      )}
      {(cameraView === 'hangar' || cameraView === 'yard') && (
        <div className="hangar-camera-note">
          <strong>{cameraView === 'yard' ? 'AUSSENKAMERA 02' : 'HALLENKAMERA 01'}</strong>
          <span>Rechte Maustaste: umsehen · Mausrad: Zoom</span>
          <button onClick={() => changeView('front')}>Zurück ins Cockpit [F]</button>
        </div>
      )}
      {help && (
        <aside className="help" aria-label="Bedienung">
          <div className="help-heading">
            <h2>Deine Pilotenkanzel</h2>
            <button
              className="help-close"
              aria-label="Hilfe schließen"
              onClick={() => setHelp(false)}
            >
              ×
            </button>
          </div>
          <div className="help-tools">
            <button
              onClick={() => {
                setHelp(false);
                setAudioCheckOpen(true);
              }}
            >
              Audioprüfung öffnen
            </button>
          </div>
          <dl>
            <dt>Kaltstart / Anzeigen</dt>
            <dd>
              Im Kaltzustand sind alle Bildschirme und Cockpitleuchten aus; nur BAT 1 hat eine grün
              blinkende Orientierungslampe. Sobald BAT 1, BAT 2 oder Hangarstrom den Steuerbus
              versorgt, starten alle zehn Anzeigen mit einer 13-sekündigen Bootsequenz. Erst danach
              sind die Touchflächen bedienbar. Taste G verbindet oder trennt den Hangarstrom auch
              bei schwarzen Displays; die bisherigen Standort- und Verriegelungssperren gelten
              weiter.
            </dd>
            <dt>Gehen / WASD</dt>
            <dd>
              Nach LINK und gelöster Parkverriegelung: Hangartor öffnen, im rechten Display GEHEN
              wählen und Leistung auf mindestens 25 % stellen. W vorwärts, S rückwärts, A/D drehen.
              Loslassen bremst sanft; Leertaste hält die Schnellbremse. Bild auf/ab verändert die
              Leistungsbegrenzung. Maximal rund 8 km/h vorwärts, 4 km/h rückwärts. Mauern, Tore,
              Container und Streckenbarrieren blockieren den Weg. Die Rampe mittig und gerade
              anfahren.
            </dd>
            <dt>Torso und Arme / B</dt>
            <dd>
              GELENKE [B] öffnet die Steuerung. Q/E dreht den Torso bis 45° nach links/rechts,
              unabhängig von der Laufrichtung. Das Cockpit und seine Kameras drehen mit. Im
              Bedienfeld linken oder rechten Arm wählen, dann Schulter und Ellenbogen getrennt
              einstellen. R fährt alle Gelenke langsam in Grundstellung. LINK, gesunde Hydraulik und
              gelöste Parkverriegelung sind nötig. Arme nur im freien Testgelände ausfahren und vor
              engen Durchfahrten wieder einziehen. Bei Strom- oder Freigabeverlust halten die
              Gelenke; alte Bewegungsziele werden verworfen. Die Waffenarme besitzen noch keine
              Greifer.
            </dd>
            <dt>Schrittbewegung</dt>
            <dd>
              Rechtes Display → GEHEN → SCHRITTBEWEGUNG: AUS / DEZENT / STARK. Die Einstellung
              ändert nur die Kopfbewegung, nicht die Bewegung oder Neigung der Maschine. Bei
              reduzierter Bewegung im Betriebssystem entfällt die Schrittbewegung.
            </dd>
            <dt>Rechte Maustaste halten</dt>
            <dd>Im Cockpit umsehen.</dd>
            <dt>Linke Maustaste</dt>
            <dd>Beschriftete Schalter bedienen. Monitore anklicken, um sie näher anzusehen.</dd>
            <dt>Mausrad / Taste F</dt>
            <dd>
              Mit dem Mausrad stark hineinzoomen; auch nach einem Klick auf ein Display weiter
              zoomen. F stellt die Pilotensicht wieder her.
            </dd>
            <dt>Hangar / Taste H</dt>
            <dd>
              Die Hallenkamera zeigt Tor, Wartungsplattformen und Kran ohne verdeckende
              Cockpitwände. Rechte Maustaste und Mausrad funktionieren auch hier. H, F oder Escape
              führen zurück; die Systeme laufen weiter. Schalter werden im Cockpit bedient.
            </dd>
            <dt>Außenbereich / Taste U</dt>
            <dd>
              TESTGELÄNDE zeigt den Industriehof mit Rampen, Prüfspur und Abendhimmel. U oder F
              bringt dich zurück ins Cockpit. Beim Wechsel der Kamera wird die Gehsteuerung
              losgelassen und der Mech bremst ab. Rechts am Zusatzdisplay: HANGAR → TOR ÖFFNEN /
              STOP / TOR SCHLIESSEN. Öffnen verlangt gültige Steuerfreigabe, gelöste
              Parkverriegelung und 0 % Leistung. Die Torsteuerung benötigt Steuerstrom; der
              Torantrieb wird unabhängig vom Hangar versorgt.
            </dd>
            <dt>Overhead / Taste O</dt>
            <dd>
              BAT 1 und BAT 2 → FUEL PUMP → APU MASTER. Nach READY auf START drücken, AVAIL abwarten
              und APU GEN zuschalten. Erst dann Hauptstrom [1].
            </dd>
            <dt>Kühlung / Elektrik links</dt>
            <dd>
              Im linken Zusatzdisplay zwischen KÜHLUNG, ELEKTRIK, HYDRAULIK und STÖRUNGEN
              umschalten. AUTO regelt den Kühlfluss und übernimmt bei Ausfall A mit Pumpe B. HAND
              nutzt die gewählte Pumpe und die COOLING-Stufe rechts. STÖRUNG A simuliert einen
              Ausfall. Die Warnaufnahme wiederholt sich bis zum Quittieren oder bis die Ursache
              behoben ist. Quittieren auf KÜHLUNG oder ELEKTRIK beendet den Ton, behebt die Ursache
              aber nicht. Derselbe Knopf setzt die Übungsstörung zurück.
            </dd>
            <dt>Störungen / Wartung</dt>
            <dd>
              Links STÖRUNGEN: Kühlmittelleck, Hilfshydraulikausfall und Lagesensorfehler gezielt
              auslösen. Ein Leck reduziert den Vorrat. LECKZWEIG ABSPERREN beendet den Verlust, der
              Bypass liefert 70 % Kühlfluss. Leistung senken und nachkühlen. Reparieren und
              Auffüllen erst kalt, mit gestopptem Reaktor, weniger als 1 L/s Restfluss und
              geschlossener Parkverriegelung. Danach Leckzweig öffnen. Hydraulik- und Sensorfehler
              über denselben Knopf zurücksetzen und Prüfungen wiederholen.
            </dd>
            <dt>Bewegungsfreigabe rechts</dt>
            <dd>
              Nach GYRO [5]: HELM VERBINDEN → KALIBRIEREN. Acht Sekunden Nullpunkt- und Lageabgleich
              abwarten. Systemtest bestehen, dann LINK [6]. Hangarstrom trennen, Leistung auf 0 %,
              PARKVERRIEGELUNG LÖSEN. Bei Verlust der Freigabe bremst der Mech automatisch; erst im
              Stillstand schließen die Parkverriegelungen. Beim Zurückkehren an den Serviceplatz
              lassen sich die Verriegelung und der Hangarstrom wieder anschließen.
            </dd>
            <dt>Hangarstrom / Batterien</dt>
            <dd>
              Taste G oder ELEKTRIK → HANGARSTROM EIN erlaubt einen Kaltstart ohne APU. BAT 1/2
              verbinden, um sie zu laden. Die Anzeige zeigt Ladezustand, Lade-/Entladestrom und
              Verbraucherlast. MAIN GEN hat Vorrang vor Hangarstrom und APU GEN. Bei Ausfall
              übernimmt eine verfügbare Quelle; Batterien versorgen nur den Steuerbus. Der
              Überlastschutz trennt eine überlastete Quelle nach zwei Sekunden. QUITTIEREN beendet
              den Warnton; SCHUTZ RESET setzt den Schutz zurück. Ein- und Ausschalten der Versorgung
              begleitet ein Schützklacken.
            </dd>
            <dt>Versorgungsfreigaben</dt>
            <dd>
              COOLANT VALVE einschalten, dann Kühlung [2]. HYD PUMP versorgt die unabhängige
              Hilfshydraulik. AVIONICS vor Diagnose [3], REACTOR ARM vor Reaktor [4]. Die Diagnose
              wartet auf mindestens 140 bar; der Reaktorstart benötigt mindestens 20 L/s Kühlfluss.
            </dd>
            <dt>Generatorübernahme</dt>
            <dd>
              Nach dem Reaktorstart MAIN GEN zuschalten. Danach APU MASTER und FUEL PUMP
              ausschalten; der Hauptgenerator versorgt den Mech. Anschließend Stabilisierung [5].
              Rechts FREIGABE: Neurohelm verbinden und kalibrieren. Systemtest [T] bestehen, dann
              Steuerfreigabe [6].
            </dd>
            <dt>Tasten 1–6</dt>
            <dd>
              1 Hauptstrom · 2 Kühlung · 3 Diagnose · 4 Reaktor · 5 Stabilisierung · 6
              Steuerfreigabe. Hauptstrom [1] trennt die Hauptsysteme. APU und Batterien werden
              separat im Overhead ausgeschaltet.
            </dd>
            <dt>Linke Konsole</dt>
            <dd>
              Lüfterstufe, Hydraulikdruck und Instrumentenhelligkeit. RED LIGHT regelt die rote
              Deckenlampe von 0 bis 100 % in 10-%-Schritten, ab verfügbarem Bordstrom. Minus/Plus
              oder Drehknopf anklicken. Den Prozentwert siehst du im linken Versorgungsdisplay.
            </dd>
            <dt>Rechte Konsole</dt>
            <dd>
              Radarreichweite, Radarsuche und HUD. COOLING regelt die Reaktorkühlung in drei Stufen
              (24 / 42,8 / 62 L/s); unabhängig vom Kabinenlüfter. Ab 85 °C erscheint eine Warnung.
              Ab 100 °C begrenzt der Temperaturschutz die Leistung bis zur Abkühlung unter 78 °C.
            </dd>
            <dt>Abschalten / Taste K</dt>
            <dd>
              SHUTDOWN [K] am rechten Zusatzdisplay startet die Anleitung: Leistung 0 %,
              Parkverriegelung schließen, LINK [6] und GYRO [5] aus. Hangarstrom verbinden oder APU
              starten und APU GEN einschalten. MAIN GEN aus. REACTOR [4] aus; Nachkühlfreigabe im
              Display abwarten. Danach COOLANT [2], Hauptstrom [1] und die Overhead-Versorgung
              ausschalten. Der Engineering-Monitor zeigt die Checkliste. Erneutes K kann die
              Anleitung vor dem Reaktorstopp beenden.
            </dd>
            <dt>Unterbrochene Nachkühlung</dt>
            <dd>
              Restwärme verschwindet bei Stromverlust nicht. APU-Versorgung, Hauptstrom und Kühlung
              wiederherstellen; mit K die Nachkühlung fortsetzen. Erst nach Freigabe ist ein neuer
              Kaltstart möglich.
            </dd>
            <dt>Systemtest / Taste T</dt>
            <dd>
              Ab GYRO [5], vor LINK [6], bei 0 % Leistung und verriegeltem Prüfstand: Testknopf am
              rechten Zusatzdisplay drücken. 210 bar einstellen, Aktuatortest abwarten, Radar
              nacheinander auf 125 / 250 / 500 m stellen. Erneutes Drücken bricht ab.
            </dd>
            <dt>Umgebungskameras</dt>
            <dd>
              Oberer rechter Monitor: sechs Außenkameras, drei vorne und drei hinten. Hauptstrom und
              AVIONICS einschalten. Die sechs nummerierten Tasten unter dem Monitor wählen ein
              Einzelbild; 6 BILDER öffnet die Übersicht, SYSTEME die bisherigen Bordsysteme. Monitor
              anklicken vergrößert die Sicht. Rückansichten sind ungespiegelt; links/rechts
              bezeichnet die Mechseite.
            </dd>
            <dt>Scheinwerfer / Taste J</dt>
            <dd>
              Zwei Doppelscheinwerfer an der Kanzel leuchten den Weg aus. Sie brauchen Bordstrom
              (Batterie, Hangarstrom oder Generator) und flackern beim Einschalten kurz wie alte
              Lampen. Nachts sind die Lichtkegel in der Außenansicht zu sehen. Die gelbe
              Rundumleuchte auf dem Rücken dreht automatisch, solange sich der Mech bewegt.
            </dd>
            <dt>Tag / Nacht / Taste N</dt>
            <dd>
              Wechselt weich zwischen Abendlicht und Nacht mit Sternenhimmel. Nachts leuchten die
              Hofscheinwerfer kräftiger, Umgebung und Nebel werden dunkel.
            </dd>
            <dt>Waffen / Taste M</dt>
            <dd>
              WAFFEN [M] ist der Hauptschalter (MASTER ARM). Gefeuert wird in der Pilotensicht mit
              der linken Maustaste, das Fadenkreuz folgt der Maus. Die beiden 30-mm-Kanonen in den
              Unterarmen schießen abwechselnd; die Lafette schwenkt rund ±24° seitlich, liegt das
              Ziel weiter außen, dreht der Torso automatisch nach (dafür muss die Parkverriegelung
              gelöst sein). Freigabe nur mit Steuerfreigabe [6] und außerhalb der Halle. Je Kanone
              150 Schuss; Dauerfeuer überhitzt die Läufe, dann ist kurz Pause. Nachladen: gesichert
              in der Halle am Serviceplatz mit geschlossener Parkverriegelung. Schalter und Knöpfe
              lassen sich auch scharf geschaltet weiter anklicken.
            </dd>
            <dt>Laser / Taste P</dt>
            <dd>
              Laser-Entfernungsmesser: roter Strahl zum Zielpunkt unter dem Fadenkreuz, Entfernung
              im HUD und am Fadenkreuz. Nachts und im Regen ist der Strahl draußen gut zu sehen.
            </dd>
            <dt>Schießstand</dt>
            <dd>
              Am Ende des Testgeländes stehen sieben Klappziele aus Stahl (fallen bei Treffer um und
              richten sich nach sechs Sekunden wieder auf), daneben zwei alte Fahrzeugwracks.
              Treffer und Schüsse zählt das HUD.
            </dd>
            <dt>Regen / Taste X</dt>
            <dd>
              Lässt es regnen: Regenschleier, der im Scheinwerferkegel aufleuchtet, nasser Asphalt
              mit Pfützen, nasse Panzerung (trocknet in der Halle langsam), Tropfen auf der
              Frontscheibe und Regenrauschen – in der Kanzel dumpf trommelnd, draußen hell. Bei
              starkem Regen zieht ein Gewitter auf: Blitze erhellen den Himmel, der Donner folgt je
              nach Entfernung. Unter dem Hallendach bleibt es trocken. Licht und Schatten werden
              trüber, der Nebel dichter.
            </dd>
            <dt>Gewicht beim Gehen</dt>
            <dd>
              Jeder Schritt stößt die Kanzel kurz an und lässt die Instrumentennadeln nachzittern.
              Die Füße wirbeln Staub auf (bei Regen Spritzer) und hinterlassen Abdrücke, die nach
              zwei Minuten verblassen. SCHRITTBEWEGUNG AUS schaltet den Kanzelstoß ab.
            </dd>
            <dt>Taste L</dt>
            <dd>
              Warmes Kabinenlicht ein-/ausschalten. Die rote Deckenlampe wird unabhängig über RED
              LIGHT links eingestellt. Die grünen Leisten neben den Seitenstreben leuchten
              automatisch ab verfügbarem Bordstrom.
            </dd>
          </dl>
          <p>
            Der obere linke Monitor zeigt die erweiterte Kaltstart-Checkliste und den nächsten
            Schritt. Links außen bedienst du Kühlung und Stromversorgung und siehst Druck und
            Temperatur, rechts außen den Systemtest. Meldungen stehen im unteren
            Kommunikationsdisplay.
          </p>
          <p>
            Beim Senken des Hydraulikdrucks hörst du die Druckentlastung. Der Hauptantrieb ist ab
            Reaktorstart hörbar; nach der Steuerfreigabe verändert der linke Leistungshebel Leistung
            und Maschinenklang. Bei gelöster Parkverriegelung begrenzt der Hebel das Gehtempo. Im
            verriegelten Zustand bleibt der stationäre Lasttest verfügbar.
          </p>
          <p>
            Prototyp: Anzeigen simulieren die Bordsysteme. Die Startlogik ist für diesen Mech
            entworfen. Overhead und beschriftete Seitenregler sind bedienbar; weitere kleine Tasten
            bleiben Dekoration.
          </p>
        </aside>
      )}
      {jointsOpen && !help && (
        <ArticulationPanel
          read={() => stateRef.current}
          command={sendJoint}
          close={() => {
            stopInput();
            setJointsOpen(false);
          }}
        />
      )}
      {armed && !['mech', 'hangar', 'yard'].includes(cameraView) && (
        <div className="reticle" ref={reticle} aria-hidden="true">
          <i
            className={
              weaponInfo?.block ? 'blocked' : weaponInfo?.onTarget === false ? 'limit' : ''
            }
          />
          <span>
            {weaponInfo?.block ??
              (weaponInfo
                ? (weaponInfo.onTarget ? '' : 'SCHWENKGRENZE · ') +
                  (weaponInfo.laser ? Math.round(weaponInfo.range) + ' m' : '')
                : '')}
          </span>
        </div>
      )}
      {hover && (
        <div
          className="hover-label"
          style={{
            left: Math.min(hover.x, typeof window === 'undefined' ? 1000 : window.innerWidth - 285),
            top: hover.y,
          }}
        >
          {hover.text}
        </div>
      )}
      <p className="screen-reader-status" role="status" aria-live="polite">
        {state.message}
      </p>
    </main>
  );
}
