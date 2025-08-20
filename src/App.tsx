import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useProgress, Environment } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

type MovementState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

function LoaderOverlay() {
  const { active, progress } = useProgress();
  return <Html center>{active ? Math.floor(progress) + "%" : null}</Html>;
}

function FlyControls({ speed }: { speed: number }) {
  const { camera, gl } = useThree();
  const movement = useRef<MovementState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });

  const direction = useRef(new THREE.Vector3());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          movement.current.forward = true;
          break;
        case "ArrowLeft":
        case "KeyA":
          movement.current.left = true;
          break;
        case "ArrowDown":
        case "KeyS":
          movement.current.backward = true;
          break;
        case "ArrowRight":
        case "KeyD":
          movement.current.right = true;
          break;
        case "Space":
          movement.current.up = true;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          movement.current.down = true;
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          movement.current.forward = false;
          break;
        case "ArrowLeft":
        case "KeyA":
          movement.current.left = false;
          break;
        case "ArrowDown":
        case "KeyS":
          movement.current.backward = false;
          break;
        case "ArrowRight":
        case "KeyD":
          movement.current.right = false;
          break;
        case "Space":
          movement.current.up = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          movement.current.down = false;
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    // request pointer lock on click to enable mouse look
    const handleClick = () => {
      if (document.pointerLockElement !== gl.domElement) {
        gl.domElement.requestPointerLock();
      }
    };
    gl.domElement.addEventListener("click", handleClick);
    return () => gl.domElement.removeEventListener("click", handleClick);
  }, [gl]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;
      const euler = new THREE.Euler(0, 0, 0, "YXZ");
      euler.setFromQuaternion(camera.quaternion);
      const PI_2 = Math.PI / 2;
      euler.y -= movementX * 0.002;
      euler.x -= movementY * 0.002;
      euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };
    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [camera, gl]);

  useFrame((_, delta) => {
    const currentSpeed = speed;
    direction.current.set(0, 0, 0);
    if (movement.current.forward) direction.current.z -= 1;
    if (movement.current.backward) direction.current.z += 1;
    if (movement.current.left) direction.current.x -= 1;
    if (movement.current.right) direction.current.x += 1;
    if (movement.current.up) direction.current.y += 1;
    if (movement.current.down) direction.current.y -= 1;

    if (direction.current.lengthSq() > 0) direction.current.normalize();

    // apply movement in camera space
    const move = new THREE.Vector3();
    move.copy(direction.current);
    move.applyQuaternion(camera.quaternion);
    move.multiplyScalar(currentSpeed * delta);
    camera.position.add(move);
  });

  return null;
}

function Scene({ glbUrl }: { glbUrl: string | null }) {
  const loader = useMemo(() => {
    const gltf = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    gltf.setDRACOLoader(draco);
    // Meshopt decoder (optional) will be auto-used by GLTFLoader from three r150+, but we can set it if needed
    // @ts-expect-error - MeshoptDecoder may be injected at runtime
    if (window.MeshoptDecoder) {
      // @ts-expect-error - typing for setMeshoptDecoder expects the global
      gltf.setMeshoptDecoder(window.MeshoptDecoder);
    }
    return gltf;
  }, []);

  const [gltf, setGltf] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let aborted = false;
    if (!glbUrl) {
      setGltf(null);
      return;
    }
    loader.load(
      glbUrl,
      (asset) => {
        if (aborted) return;
        const scene = asset.scene || asset.scenes?.[0];
        // enable shadows on loaded meshes so that scene lighting has effect
        scene?.traverse((object) => {
          // @ts-expect-error - isMesh is a runtime flag on Object3D at runtime
          if (object.isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        setGltf(scene ?? null);
      },
      undefined,
      (err) => {
        if (aborted) return;
        console.error(err);
        setGltf(null);
      }
    );
    return () => {
      aborted = true;
    };
  }, [glbUrl, loader]);

  return (
    <>
      <Suspense fallback={<LoaderOverlay />}>{gltf && <primitive object={gltf} />}</Suspense>
      {/* simple fallback environment: large grid for orientation */}
      <gridHelper args={[200, 200, "#444", "#222"]} />
    </>
  );
}

function App() {
  const [dpr, setDpr] = useState(1.25);
  const [movementSpeed, setMovementSpeed] = useState(10);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [ambientIntensity, setAmbientIntensity] = useState(0.6);
  const [dirIntensity, setDirIntensity] = useState(1.2);
  const [dirPos, setDirPos] = useState<[number, number, number]>([5, 10, 5]);
  const presetOptions = ["city", "sunset", "studio", "warehouse", "forest", "dawn"] as const;
  type Preset = (typeof presetOptions)[number];
  const [envPreset, setEnvPreset] = useState<Preset>("warehouse");

  // clamp DPR based on device capability
  const pixelRatio = Math.min(Math.max(0.75, dpr), 2);

  const onFileSelected = (file: File) => {
    const url = URL.createObjectURL(file);
    setGlbUrl(url);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };
  const handleBrowse: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="app-root" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <button className="ui-toggle" onClick={() => setUiVisible((v) => !v)}>
        {uiVisible ? "Hide UI" : "Show UI"}
      </button>
      {uiVisible && (
        <div className="topbar">
          <div className="controls">
            <label title="Camera movement speed (units per second). Increase to move faster around the scene.">
              Speed{" "}
              <span
                className="info has-tooltip"
                aria-label="Camera movement speed tooltip"
                data-tip="Camera movement speed (units per second). Increase to move faster around the scene."
              >
                ?
              </span>
              : <input type="range" min={1} max={50} step={1} value={movementSpeed} onChange={(e) => setMovementSpeed(Number(e.target.value))} /> {movementSpeed}
            </label>
            <label title="DPR (Device Pixel Ratio): scales render resolution. Lower for better performance, higher for sharper image but heavier GPU load.">
              DPR{" "}
              <span
                className="info has-tooltip"
                aria-label="Device Pixel Ratio tooltip"
                data-tip="DPR (Device Pixel Ratio): scales render resolution. Lower for better performance, higher for sharper image but heavier GPU load."
              >
                ?
              </span>
              : <input type="range" min={0.75} max={2} step={0.05} value={dpr} onChange={(e) => setDpr(Number(e.target.value))} /> {pixelRatio.toFixed(2)}
            </label>
            <br />
            <label title="Ambient light intensity">
              Ambient: <input type="range" min={0} max={5} step={0.05} value={ambientIntensity} onChange={(e) => setAmbientIntensity(Number(e.target.value))} />{" "}
              {ambientIntensity.toFixed(2)}
            </label>
            <label title="Directional light intensity">
              Dir Intensity: <input type="range" min={0} max={10} step={0.05} value={dirIntensity} onChange={(e) => setDirIntensity(Number(e.target.value))} />{" "}
              {dirIntensity.toFixed(2)}
            </label>
            <div className="triple-slider" title="Directional light position (X/Y/Z)">
              <span>Dir Pos</span>
              <label>
                X:{" "}
                <input
                  type="range"
                  min={-20}
                  max={50}
                  step={0.5}
                  value={dirPos[0]}
                  onChange={(e) => {
                    const x = Number(e.target.value);
                    setDirPos(([, y, z]) => [x, y, z]);
                  }}
                />{" "}
                {dirPos[0].toFixed(1)}
              </label>
              <label>
                Y:{" "}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={dirPos[1]}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setDirPos(([x, , z]) => [x, y, z]);
                  }}
                />{" "}
                {dirPos[1].toFixed(1)}
              </label>
              <label>
                Z:{" "}
                <input
                  type="range"
                  min={-20}
                  max={50}
                  step={0.5}
                  value={dirPos[2]}
                  onChange={(e) => {
                    const z = Number(e.target.value);
                    setDirPos(([x, y]) => [x, y, z]);
                  }}
                />{" "}
                {dirPos[2].toFixed(1)}
              </label>
            </div>
            <div className="env-presets" title="Environment preset (HDRI)">
              <span>Env</span>
              {presetOptions.map((p) => (
                <label key={p} style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
                  <input type="checkbox" checked={envPreset === p} onChange={() => setEnvPreset(p)} />
                  <span>{p}</span>
                </label>
              ))}
            </div>
            <label className="upload">
              <input type="file" accept=".glb,.gltf" onChange={handleBrowse} />
              <span>Upload GLB/GLTF</span>
            </label>
          </div>
          <div className="hint">Click canvas to enable mouse look. Use WASD/Arrow keys, Space (up), Shift (down).</div>
        </div>
      )}
      <Canvas dpr={pixelRatio} camera={{ position: [0, 1.6, 3], near: 0.01, far: 2000 }} shadows>
        <color attach="background" args={[0x1a1a1a]} />
        <ambientLight intensity={ambientIntensity} />
        <directionalLight position={dirPos} intensity={dirIntensity} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0001} />
        <hemisphereLight args={[0xffffff, 0x444444, 0.5]} />
        <Environment preset={envPreset} background={false} />
        <FlyControls speed={movementSpeed} />
        <Scene glbUrl={glbUrl} />
      </Canvas>
      {!glbUrl && (
        <div className="dropzone">
          <p>Drag & drop a large .glb here or use the Upload button above.</p>
        </div>
      )}
    </div>
  );
}

export default App;
