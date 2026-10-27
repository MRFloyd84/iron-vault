import { Fragment, useEffect, useRef, useState } from 'react';
import LanguageMenu, { useLang } from './language-menu';
import GraphicsMenu from './graphics-menu';
import { HELP } from './help-content';
import { tr } from '../lib/i18n';
import ArticulationPanel from './articulation-panel';
import MissionPanel from './mission-panel';
import PerfOverlay from './perf-overlay';
import { sectorName } from '../lib/terrain';
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
import { walkInput, idleInput, walkSetting, walkingStopped, walkGear } from '../lib/walking';
import { hangarCommand } from '../lib/hangar';
import {
  MAP_ACTION,
  ROUTE_RADIUS,
  disengage,
  fmsCommand,
  isMcduAction,
  logMessage,
  type FmsState,
} from '../lib/autopilot';
import { walkGrid } from '../lib/route-planner';
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
  // Sprache: Wechsel zeichnet die Oberfläche neu (Displays übersetzen beim Zeichnen).
  const lang = useLang();
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
  const [drone, setDrone] = useState<ReturnType<CockpitScene['droneInfo']> | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);
  const [track, setTrack] = useState<ReturnType<CockpitScene['missionInfo']> | null>(null);
  const readMission = useRef(() => scene.current?.missionInfo() ?? null).current;
  const trackKey = useRef('');
  const droneKeyRef = useRef('');
  const getScene = useRef(() => scene.current).current;
  const [diag, setDiag] = useState(() => {
    try {
      return localStorage.getItem('iron-vault.diag') === '1' || location.search.includes('diag=1');
    } catch {
      return false;
    }
  });
  const toggleDiag = () =>
    setDiag((v) => {
      try {
        localStorage.setItem('iron-vault.diag', v ? '0' : '1');
      } catch {
        /* nur für diese Sitzung */
      }
      return !v;
    });
  const updateInputRef = useRef<() => void>(() => {});
  const droneControlsRef = useRef(false);
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
  const toggleDrone = () => {
    const sc = scene.current;
    if (!sc) return;
    const result = sc.droneToggle(stateRef.current);
    if (!result) return;
    apply({ ...stateRef.current, message: result.message, error: result.error });
    if (result.error) audio.current?.beep(true);
    else void audio.current?.playSwitch().catch(() => {});
    if (sc.inDrone && !sc.droneInfo().airborne) changeView('front');
  };
  const toggleFollow = () => {
    const sc = scene.current;
    if (!sc) return;
    const result = sc.droneFollow(stateRef.current);
    if (!result) return;
    apply({ ...stateRef.current, message: result.message, error: result.error });
    if (result.error) audio.current?.beep(true);
    else void audio.current?.playSwitch().catch(() => {});
    // Steuertasten wechseln zwischen Drohne und Mech: gedrückte Tasten neu zuordnen
    updateInputRef.current();
  };
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
    if (view === 'drone' && !scene.current.droneInfo().airborne) return;
    stopInput();
    scene.current.view(view);
    setCameraView(view);
    setHover(null);
  };
  const apply = (incoming: MachineState) => {
    const previous = stateRef.current;
    const next = incoming.message !== previous.message ? logMessage(incoming) : incoming;
    stateRef.current = next;
    // Autopilot: Signaltöne beim Ein- und Ausschalten, MCDU sofort neu zeichnen
    const pf = previous.fms,
      nf = next.fms;
    if (pf.ap === 'off' && nf.ap !== 'off') audio.current?.apChime('on');
    if (pf.ap !== 'off' && nf.ap === 'off')
      audio.current?.apChime(
        next.error ? 'off' : /Ziel erreicht/.test(next.message) ? 'arrive' : 'off',
      );
    if (mcduChanged(pf, nf) || previous.message !== next.message)
      scene.current?.refreshScreen('comm');
    audio.current?.update(next);
    if (
      (next.thermalWarning && !previous.thermalWarning) ||
      (next.thermalLimited && !previous.thermalLimited)
    )
      audio.current?.beep(true);
    // Telemetry goes straight to the instruments. React only needs chrome/status changes.
    if (
      previous.fms.ap !== next.fms.ap ||
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
    if (isMcduAction(index)) {
      void audio.current?.playSwitch().catch(() => {});
      if (index === MAP_ACTION) {
        setMissionOpen(true);
        return;
      }
      const previous = stateRef.current,
        next = fmsCommand(previous, index);
      apply(next);
      if (next.error && next !== previous) audio.current?.beep(true);
      return;
    }
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
          scene.current.onExplosion = (distance, size) => audio.current?.explosion(distance, size);
          if (import.meta.env.DEV)
            (window as unknown as { ironVault?: unknown }).ironVault = {
              scene: scene.current,
              state: stateRef,
            };
          const sc = scene.current;
          void sc.ready
            .then(() => sc.precompile())
            // Begehbarkeitsraster für den Autopiloten hinter dem Ladebildschirm vorbereiten
            .then(() => void walkGrid(ROUTE_RADIUS))
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
    const movementCodes = [
      'KeyW',
      'KeyS',
      'KeyA',
      'KeyD',
      'Space',
      'KeyQ',
      'KeyE',
      'ShiftLeft',
      'ShiftRight',
      'PitchUp',
      'PitchDown',
    ];
    // X/Y nach Beschriftung (QWERTZ und QWERTY): Oberkörper leicht nach oben/unten neigen
    const virtualCode = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      return k === 'x' ? 'PitchUp' : k === 'y' ? 'PitchDown' : e.code;
    };
    const updateInput = () => {
      const keys = held.current;
      const k = (code: string) => Number(keys.has(code));
      // Fliegt die Drohne, gehören ihr die Steuertasten; der Mech bleibt stehen.
      if (scene.current?.droneInfo().controls) {
        scene.current.setDroneInput({
          forward: k('KeyW') - k('KeyS'),
          strafe: k('KeyD') - k('KeyA'),
          climb: k('Space') - Math.max(k('ShiftLeft'), k('ShiftRight')),
          turn: k('KeyE') - k('KeyQ'),
        });
        apply(walkInput(stateRef.current, idleInput()));
        apply(jointInput(stateRef.current, neutralJoints()));
        return;
      }
      scene.current?.setDroneInput({ forward: 0, strafe: 0, climb: 0, turn: 0 });
      // Lenken, Gas oder Bremse des Piloten trennt den Autopiloten sofort
      if (
        stateRef.current.fms.ap !== 'off' &&
        ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].some((c) => keys.has(c))
      )
        apply(disengage(stateRef.current, 'Autopilot aus – Steuerung übernommen.'));
      else if (stateRef.current.fms.ap !== 'off') {
        apply(
          jointInput(stateRef.current, {
            ...neutralJoints(),
            torso: Number(keys.has('KeyQ')) - Number(keys.has('KeyE')),
            pitch: Number(keys.has('PitchUp')) - Number(keys.has('PitchDown')),
          }),
        );
        return;
      }
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
          pitch: Number(keys.has('PitchUp')) - Number(keys.has('PitchDown')),
        }),
      );
    };
    updateInputRef.current = updateInput;
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
      const code = virtualCode(e);
      // Umschalt: Geschwindigkeitsstufe (fliegt die Drohne, gehört Umschalt ihr)
      if (
        (e.code === 'ShiftLeft' || e.code === 'ShiftRight') &&
        !e.repeat &&
        !helpRef.current &&
        scene.current &&
        !scene.current.droneInfo().controls
      )
        apply(walkGear(stateRef.current));
      if (movementCodes.includes(code)) {
        if (helpRef.current || !scene.current) return;
        if ((scene.current.inHangar || scene.current.inYard) && !scene.current.droneInfo().controls)
          return;
        e.preventDefault();
        if (e.target instanceof HTMLButtonElement) e.target.blur();
        if (e.repeat || held.current.has(code)) return;
        held.current.add(code);
        updateInput();
        void audio.current?.enable().catch(() => {});
        return;
      }
      if (e.repeat) return;
      if (e.code === 'F3') {
        e.preventDefault();
        toggleDiag();
        return;
      }
      if (e.code === 'KeyG' && !helpRef.current) {
        e.preventDefault();
        operate.current(68);
        return;
      }
      if (e.key === 'Escape') {
        stopInput();
        setHelp(false);
        setAudioCheckOpen(false);
        setMissionOpen(false);
        if (
          scene.current?.inHangar ||
          scene.current?.inYard ||
          scene.current?.inMech ||
          scene.current?.inDrone
        )
          changeView('front');
        return;
      }
      // Drohne: C startet bzw. ruft zurück, Tab wechselt zwischen Cockpit und Drohnensicht.
      if (e.code === 'Tab' && !helpRef.current && scene.current?.droneInfo().airborne) {
        e.preventDefault();
        changeView(scene.current.inDrone ? 'front' : 'drone');
        return;
      }
      if (e.code === 'KeyC' && !helpRef.current) {
        toggleDrone();
        return;
      }
      // 7: Drohne begleitet den Mech (startet angedockt selbstständig) / Handsteuerung
      if (e.key === '7' && !helpRef.current) {
        e.preventDefault();
        toggleFollow();
        return;
      }
      if (helpRef.current) return;
      if (e.code === 'KeyI') {
        stopInput();
        setMissionOpen((v) => !v);
        return;
      }
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
      if (e.key.toLowerCase() === 'z' && !e.repeat) toggleRain();
      if (e.key.toLowerCase() === 'm' && !e.repeat) toggleArmed();
      if (e.key.toLowerCase() === 'p' && !e.repeat) toggleLaser();
      if (e.key.toLowerCase() === 't') operate.current(30);
      if (e.key.toLowerCase() === 'k') operate.current(35);
    };
    const keyup = (e: KeyboardEvent) => {
      if (held.current.delete(virtualCode(e)) || held.current.delete(e.code)) {
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
  // Drohne mit 10 Hz abfragen: Anzeige, Ton, Steuerübergabe und Meldungen.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const sc = scene.current;
      if (!sc) return;
      const info = sc.droneInfo();
      // Anzeige nur bei sichtbaren Änderungen neu zeichnen
      const show = info.phase === 'docked' && info.rotor < 0.01 && !info.follow ? null : info;
      const droneKey = show
        ? [
            show.phase,
            Math.round(show.battery * 100),
            Math.round(show.signal * 100),
            Math.round(show.altitude),
            Math.round(show.distance),
            show.marked,
            show.rtbReason,
            show.airborne,
            show.follow,
          ].join('|')
        : '';
      if (droneKey !== droneKeyRef.current) {
        droneKeyRef.current = droneKey;
        setDrone(show);
      }
      if (info.controls !== droneControlsRef.current) {
        droneControlsRef.current = info.controls;
        updateInputRef.current();
      }
      const level = sc.inDrone ? 0.75 : Math.max(0, 1 - info.distance / 90);
      audio.current?.setDrone(
        info,
        level,
        !sc.inDrone && !sc.inMech && !sc.inYard && !sc.inHangar,
        sc.inDrone,
      );
      if (sc.droneNotice) {
        apply({ ...stateRef.current, message: sc.droneNotice, error: false });
        sc.droneNotice = null;
      }
      if (sc.droneReturned) {
        sc.droneReturned = false;
        setCameraView('front');
      }
      // Einsatz: Wegweiser und Meldungen
      // Nur neu zeichnen, wenn sich Sichtbares ändert (nicht zehnmal pro Sekunde).
      const t = sc.missionInfo(),
        a = t.active;
      const key = [
        sectorName(t.x, t.z),
        t.z < -250 || Math.abs(t.x) > 70,
        a?.id,
        a?.status,
        a?.next?.label,
        Math.round(a?.next?.distance ?? 0),
        Math.round(((a?.next?.bearing ?? 0) - t.heading) / 3),
        Math.round((a?.scanning?.progress ?? 0) * 20),
        a?.objectives.filter((o) => o.done).length,
      ].join('|');
      if (key !== trackKey.current) {
        trackKey.current = key;
        setTrack(t);
      }
      // Nächstes Einsatzziel als Ziel für DIR im MCDU
      const nx = a?.status === 'active' ? a.next : null;
      const want = nx ? { id: 'mission', name: nx.label, x: nx.x, z: nx.z } : null;
      const have = stateRef.current.fms.mission;
      if (
        (want === null) !== (have === null) ||
        (want && have && (want.name !== have.name || want.x !== have.x || want.z !== have.z))
      )
        apply({ ...stateRef.current, fms: { ...stateRef.current.fms, mission: want } });
      const notice = sc.missions.notices.shift();
      if (notice) {
        apply({ ...stateRef.current, message: notice.text, error: false });
        if (notice.done) void audio.current?.playSwitch().catch(() => {});
        else audio.current?.beep(false);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
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
    audio.current?.setRain(rain ? 1 : 0, !['mech', 'hangar', 'yard', 'drone'].includes(cameraView));
  }, [rain, cameraView, audioStatus]);
  return (
    <main className="cockpit-app">
      <div
        className="scene"
        ref={container}
        aria-label={tr(
          'Interaktive 3D-Pilotenkanzel. Startschritte mit den physischen Schaltern oder den Tasten 1 bis 6 bedienen.',
        )}
      />
      {!['mech', 'hangar', 'yard'].includes(cameraView) && (
        <div className="cabin-vignette" aria-hidden="true" />
      )}
      {!loaded && !failure && (
        <div className="loading">
          <strong>{tr('IRON VAULT')}</strong>
          <small>{tr('Pilotenkanzel und Mech werden geladen …')}</small>
          <div className="loading-bar" aria-hidden="true" />
        </div>
      )}
      {failure && (
        <div className="error-panel">
          <h2>{tr('3D-Ansicht nicht verfügbar')}</h2>
          <p>{tr(failure)}</p>
          <button onClick={() => location.reload()}>{tr('Erneut laden')}</button>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">{tr('IV')}</div>
          <div>
            <h1>{tr('IRON VAULT')}</h1>
            <div className="eyebrow">{tr('MK. IV / PILOTENKANZEL')}</div>
          </div>
        </div>
        <div className="top-right">
          <div className={'status-pill ' + statusTone(state)}>
            <i />
            {tr(statusText(state))}
          </div>
          <div className="toolbar">
            <GraphicsMenu />
            <LanguageMenu />
            <button
              className="icon-button"
              title={tr(soundLabel)}
              aria-label={tr(soundLabel)}
              aria-pressed={audioActive}
              onClick={toggleSound}
            >
              {audioActive ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              className="icon-button"
              title={tr('Sicht zurücksetzen [F]')}
              aria-label={tr('Sicht zurücksetzen')}
              onClick={() => changeView('front')}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-button"
              title={tr('Bedienung')}
              aria-label={tr('Bedienung anzeigen')}
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
              title={tr('Vollbild')}
              aria-label={tr('Vollbild umschalten')}
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
              {track &&
              cameraView !== 'hangar' &&
              cameraView !== 'yard' &&
              (track.z < -250 || Math.abs(track.x) > 70)
                ? tr('WÜSTE · SEKTOR ' + sectorName(track.x, track.z))
                : tr(
                    cameraView === 'yard' || (cameraView !== 'hangar' && state.walk.z < -35)
                      ? 'TESTGELÄNDE 07'
                      : 'HANGAR 07',
                  )}
            </strong>
            {tr(
              cameraView === 'drone'
                ? 'DROHNE · AUFKLÄRUNG'
                : cameraView === 'mech'
                  ? 'IV–04 · AUSSENANSICHT'
                  : cameraView === 'yard'
                    ? 'AUSSENKAMERA · PRÜFSTRECKE'
                    : cameraView === 'hangar'
                      ? 'HALLENKAMERA · WARTUNGSBEREICH'
                      : 'PILOTENSICHT · ' +
                        restraintLabel(state) +
                        (state.walk.gear === 2 ? ' · STUFE 2' : '') +
                        (state.fms.ap === 'nav'
                          ? ' · AP NAV'
                          : state.fms.ap === 'hold'
                            ? ' · AP HOLD'
                            : ''),
            )}
          </div>
          {track?.active && track.active.status === 'active' && (
            <div className="mission-track">
              <strong>{tr(track.active.title)}</strong>
              {track.active.next && (
                <span className="track-next">
                  <i
                    className="track-arrow"
                    style={{ transform: `rotate(${track.active.next.bearing - track.heading}deg)` }}
                    aria-hidden="true"
                  />
                  {tr(track.active.next.label)}
                  <b>
                    {Math.round(track.active.next.distance)} m ·{' '}
                    {String(Math.round(track.active.next.bearing)).padStart(3, '0')}°
                  </b>
                </span>
              )}
              {track.active.scanning && (
                <span className="track-scan">
                  {tr('ERFASSE ' + track.active.scanning.label)}
                  <em style={{ width: Math.round(track.active.scanning.progress * 100) + '%' }} />
                </span>
              )}
              <span className="track-count">
                {tr(
                  'Ziele: ' +
                    track.active.objectives.filter((o) => o.done).length +
                    ' / ' +
                    track.active.objectives.length,
                )}
              </span>
            </div>
          )}
          {!audioActive && (
            <button className="audio-notice" onClick={toggleSound}>
              {tr(soundLabel)}
            </button>
          )}
        </div>
        <div className="view-presets" aria-label={tr('Kameraansichten')}>
          <button
            className="joint-toggle"
            aria-expanded={jointsOpen}
            onClick={() => {
              stopInput();
              setJointsOpen((v) => !v);
            }}
          >
            {tr('GELENKE [B]')}
          </button>
          <button
            aria-pressed={state.walk.gear === 2}
            title={tr('Geschwindigkeitsstufe: Schritt oder Eilmarsch (Umschalt)')}
            onClick={() => apply(walkGear(stateRef.current))}
          >
            {tr(state.walk.gear === 2 ? 'STUFE 2 [⇧]' : 'STUFE 1 [⇧]')}
          </button>
          <button
            className="mech-view group-end"
            aria-pressed={cameraView === 'mech'}
            onClick={() => changeView('mech')}
          >
            {tr('MECH [V]')}
          </button>
          <button
            className="hangar-view"
            aria-pressed={cameraView === 'hangar'}
            onClick={() => changeView('hangar')}
          >
            {tr('HANGAR [H]')}
          </button>
          <button
            className="group-end"
            aria-pressed={cameraView === 'yard'}
            onClick={() => changeView('yard')}
          >
            {tr('TESTGELÄNDE [U]')}
          </button>
          <button
            className="mission-toggle"
            aria-expanded={missionOpen}
            title={tr('Einsatz wählen, Lagekarte')}
            onClick={() => {
              stopInput();
              setMissionOpen((v) => !v);
            }}
          >
            {tr('EINSATZ [I]')}
          </button>
          <button
            className="drone-toggle"
            aria-pressed={!!drone && drone.phase !== 'docked'}
            title={tr('Drohne starten oder zurückrufen. Tab: Drohnensicht.')}
            onClick={toggleDrone}
          >
            {tr(drone && drone.phase !== 'docked' ? 'DROHNE ZURÜCK [C]' : 'DROHNE [C]')}
          </button>
          <button
            aria-pressed={!!drone?.follow}
            title={tr(
              'Begleitmodus: Drohne startet selbstständig, folgt dem Mech und lädt zwischendurch. Die Steuertasten bleiben beim Mech.',
            )}
            onClick={toggleFollow}
          >
            {tr('BEGLEITEN [7]')}
          </button>
          {drone?.airborne && (
            <button
              className="group-end"
              aria-pressed={cameraView === 'drone'}
              onClick={() => changeView(cameraView === 'drone' ? 'front' : 'drone')}
            >
              {tr('DROHNENSICHT [TAB]')}
            </button>
          )}
          <button aria-pressed={cameraView === 'overhead'} onClick={() => changeView('overhead')}>
            {tr('OVERHEAD [O]')}
          </button>
          <button aria-pressed={cameraView === 'left'} onClick={() => changeView('left')}>
            {tr('LINKS')}
          </button>
          <button aria-pressed={cameraView === 'front'} onClick={() => changeView('front')}>
            {tr('COCKPIT [F]')}
          </button>
          <button aria-pressed={cameraView === 'right'} onClick={() => changeView('right')}>
            {tr('RECHTS')}
          </button>
          <button
            className="group-end"
            aria-pressed={cameraView === 'panel'}
            onClick={() => changeView('panel')}
          >
            {tr('INSTRUMENTE')}
          </button>
          <button
            aria-pressed={headlights}
            title={tr(
              dcPowerAvailable(state)
                ? 'Scheinwerfer ein/aus'
                : 'Scheinwerfer brauchen Bordstrom (Batterie, Hangarstrom oder Generator)',
            )}
            onClick={toggleHeadlights}
          >
            {tr('SCHEINWERFER [J]')}
          </button>
          <button
            aria-pressed={armed}
            className="weapon-toggle"
            title={tr(
              'Hauptschalter Waffen (MASTER ARM). Feuern: linke Maustaste in der Pilotensicht.',
            )}
            onClick={toggleArmed}
          >
            {tr('WAFFEN [M]')}
          </button>
          <button aria-pressed={laser} onClick={toggleLaser} title={tr('Laser-Entfernungsmesser')}>
            {tr('LASER [P]')}
          </button>
          <button aria-pressed={rain} onClick={toggleRain}>
            {tr('REGEN [Z]')}
          </button>
          <button aria-pressed={night} onClick={toggleNight}>
            {tr(night ? 'NACHT [N]' : 'TAG [N]')}
          </button>
        </div>
      </div>
      {cameraView === 'mech' && (
        <aside className="mech-inspection" aria-label={tr('Mech-Außenansicht')}>
          <strong>{tr('IV–04 / PILOTENKAPSEL')}</strong>
          <p>
            {tr('Maus ziehen: rundum drehen')}
            <br />

            {tr('Mausrad: Abstand ändern')}
          </p>
          <div className="mech-angles">
            <button onClick={() => scene.current?.orbitPreset('front')}>{tr('Vorne')}</button>
            <button onClick={() => scene.current?.orbitPreset('side')}>{tr('Seite')}</button>
            <button onClick={() => scene.current?.orbitPreset('rear')}>{tr('Hinten')}</button>
          </div>
          <p>
            {tr('WASD: gehen, wenn freigegeben.')}
            <br />

            {tr('Leertaste: Schnellbremse.')}
          </p>
          <button className="mech-return" onClick={() => changeView('front')}>
            {tr('Ins Cockpit [F / V]')}
          </button>
        </aside>
      )}
      {(cameraView === 'hangar' || cameraView === 'yard') && (
        <div className="hangar-camera-note">
          <strong>{tr(cameraView === 'yard' ? 'AUSSENKAMERA 02' : 'HALLENKAMERA 01')}</strong>
          <span>{tr('Rechte Maustaste: umsehen · Mausrad: Zoom')}</span>
          <button onClick={() => changeView('front')}>{tr('Zurück ins Cockpit [F]')}</button>
        </div>
      )}
      {cameraView === 'drone' && (
        <div className="drone-view" aria-label={tr('Drohnensicht')}>
          <div
            className="drone-noise"
            style={{ opacity: 0.08 + (1 - (drone?.signal ?? 1)) * 0.6 }}
          />
          <div className="drone-cross" aria-hidden="true" />
          <div className="drone-status">
            <strong>{tr('DROHNE / AUFKLÄRUNG')}</strong>
            <span>
              {tr(
                drone?.phase === 'rtb'
                  ? 'RÜCKKEHR'
                  : drone?.phase === 'landing'
                    ? 'LANDUNG'
                    : drone?.phase === 'flying'
                      ? 'FLUG'
                      : drone?.phase === 'follow'
                        ? 'BEGLEITEN'
                        : 'START',
              )}
            </span>
            <span>{tr(`HÖHE ${Math.round(drone?.altitude ?? 0)} m`)}</span>
            <span>{tr(`ABSTAND ${Math.round(drone?.distance ?? 0)} m`)}</span>
            <span className={(drone?.battery ?? 1) < 0.2 ? 'warn' : ''}>
              {tr(`AKKU ${Math.round((drone?.battery ?? 1) * 100)} %`)}
            </span>
            <span className={(drone?.signal ?? 1) < 0.4 ? 'warn' : ''}>
              {tr(`FUNK ${Math.round((drone?.signal ?? 1) * 100)} %`)}
            </span>
            {drone?.marked && <span className="mark">{tr('ZIEL MARKIERT')}</span>}
            {drone?.rtbReason === 'battery' && (
              <span className="warn">{tr('AKKU LEER – AUTOMATISCHE RÜCKKEHR')}</span>
            )}
            {drone?.rtbReason === 'hall' && drone?.follow && (
              <span className="warn">{tr('MECH IN DER HALLE – DROHNE WARTET')}</span>
            )}
            {drone?.rtbReason === 'signal' && (
              <span className="warn">{tr('FUNK VERLOREN – AUTOMATISCHE RÜCKKEHR')}</span>
            )}
          </div>
          <div className="drone-hint">
            {tr(
              drone?.phase === 'follow'
                ? 'Begleitmodus: W A S D steuern den Mech · 7: Drohne von Hand fliegen'
                : 'W A S D: fliegen · Q / E: drehen · Leertaste / Umschalt: steigen / sinken · 7: Begleitmodus',
            )}
            <br />
            {tr(
              'Linksklick: Ziel markieren · Rechte Maustaste: Kamera schwenken · Tab: Cockpit · C: Rückkehr',
            )}
          </div>
        </div>
      )}
      {help && (
        <aside className="help" aria-label={tr('Bedienung')}>
          <div className="help-heading">
            <h2>{HELP[lang].title}</h2>
            <button
              className="help-close"
              aria-label={tr('Hilfe schließen')}
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
              {tr('Audioprüfung öffnen')}
            </button>
            <button aria-pressed={diag} onClick={toggleDiag}>
              {tr(diag ? 'Diagnose ausblenden (F3)' : 'Diagnose anzeigen (F3)')}
            </button>
          </div>
          <dl>
            {HELP[lang].sections.map(([title, text]) => (
              <Fragment key={title}>
                <dt>{title}</dt>
                <dd>{text}</dd>
              </Fragment>
            ))}
          </dl>
          {HELP[lang].notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </aside>
      )}
      {diag && <PerfOverlay scene={getScene} />}
      {missionOpen && !help && (
        <MissionPanel
          read={readMission}
          start={(id) => {
            scene.current?.startMission(id);
            setMissionOpen(false);
          }}
          abort={() => scene.current?.abortMission()}
          close={() => setMissionOpen(false)}
          nav={() => {
            const f = stateRef.current.fms,
              plan = f.tmpy ?? f.plan,
              w = stateRef.current.walk;
            return {
              route: plan
                ? {
                    points:
                      !f.tmpy && f.ap !== 'off'
                        ? [{ x: w.x, z: w.z }, ...plan.points.slice(f.leg)]
                        : plan.points,
                    tmpy: !!f.tmpy,
                  }
                : null,
              mapPoint: f.mapPoint,
            };
          }}
          pick={(x, z) => {
            const s = stateRef.current;
            apply({
              ...s,
              fms: {
                ...s.fms,
                mapPoint: { id: 'map', name: 'KARTENPUNKT ' + sectorName(x, z), x, z },
                page: 'dir',
                scroll: 0,
              },
              message: 'Kartenpunkt gesetzt (' + sectorName(x, z) + '). Im MCDU unter DIR wählen.',
              error: false,
            });
            void audio.current?.playSwitch().catch(() => {});
          }}
        />
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
      {armed && !['mech', 'hangar', 'yard', 'drone'].includes(cameraView) && (
        <div className="reticle" ref={reticle} aria-hidden="true">
          <i
            className={
              weaponInfo?.block ? 'blocked' : weaponInfo?.onTarget === false ? 'limit' : ''
            }
          />
          <span>
            {tr(
              weaponInfo?.block ??
                (weaponInfo
                  ? (weaponInfo.onTarget ? '' : 'SCHWENKGRENZE · ') +
                    (weaponInfo.laser ? Math.round(weaponInfo.range) + ' m' : '')
                  : ''),
            )}
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
          {tr(hover.text)}
        </div>
      )}
      <p className="screen-reader-status" role="status" aria-live="polite">
        {tr(state.message)}
      </p>
    </main>
  );
}

/** Hat sich am MCDU etwas Sichtbares geändert (ohne Uhr und Fortschrittskontrolle)? */
function mcduChanged(a: FmsState, b: FmsState) {
  return (
    a.page !== b.page ||
    a.scroll !== b.scroll ||
    a.plan !== b.plan ||
    a.tmpy !== b.tmpy ||
    a.leg !== b.leg ||
    a.ap !== b.ap ||
    a.gear !== b.gear ||
    a.preferRoads !== b.preferRoads ||
    a.stopDistance !== b.stopDistance ||
    a.brightness !== b.brightness ||
    a.log !== b.log ||
    a.mission !== b.mission ||
    a.mapPoint !== b.mapPoint
  );
}
