// ====================================================================
// 1. VARIÁVEIS GLOBAIS
// ====================================================================

let scene, camera, renderer, clock; 
let sluiceGates = []; 
let waterMeshes = []; 
let rainSystem;
let isRaining = false; 
let sensorLight; 

let isIAActive = false; 
let currentIAPrediction = 0; 
let iaStartTime = 0;

// FÍSICA DA ÁGUA
let currentWaterLevel = 0.6; 
const MIN_LEVEL = 0.1;
const MAX_LEVEL = 0.7; 
let isResupplying = false; 

// --- MEDIDAS FIXAS ---
const CHANNEL_LENGTH = 50;  
const CHANNEL_WIDTH = 6; 
const WALL_HEIGHT = 1.3;    
const WALL_THICKNESS = 0.5; 
const FLOOR_THICKNESS = 0.5;

const GATE_CLOSED_Y = 0.0; 
const GATE_OPEN_Y = 0.8; 

const SECTION_COLORS = [0x555555, 0x555555, 0x555555]; 

// ====================================================================
// 2. INICIALIZAÇÃO
// ====================================================================

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Ajustei a câmara para pegar um ângulo que mostre o sensor "atrás" das comportas
    camera.position.set(10, 8, 8); 
    camera.lookAt(0, 0, 0); 
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement); 

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9); 
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    clock = new THREE.Clock();

    createChannel(); 
    createRain(); 

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// ====================================================================
// 3. ANIMAÇÃO
// ====================================================================

function animate() {
    requestAnimationFrame(animate); 
    const deltaTime = clock.getDelta(); 
    const elapsedTime = clock.getElapsedTime(); 

    updateWaterPhysics(deltaTime);

    waterMeshes.forEach((mesh, index) => {
        const gateGroup = sluiceGates[index]; 
        const isOpen = gateGroup.position.y > 0.1;

        mesh.position.y = 0.05 + (currentWaterLevel * 0.5); 

        if (isOpen) {
            mesh.userData.flowTime += deltaTime;
            mesh.material.uniforms.time.value = mesh.userData.flowTime;
        }
    });

    if (isRaining && rainSystem) {
        const positions = rainSystem.geometry.attributes.position.array;
        for(let i = 1; i < positions.length; i += 3) {
            positions[i] -= 0.8; 
            if (positions[i] < -2) positions[i] = 20; 
        }
        rainSystem.geometry.attributes.position.needsUpdate = true;
    }
    
    if (isIAActive) {
        if (!isRaining) {
            let localTime = elapsedTime - iaStartTime;
            currentIAPrediction = Math.round((Math.sin((localTime / 5) - 1.57) * 0.5 + 0.5) * 100); 
            updateIAPanel(currentIAPrediction);
            actuateGatesByIAPrediction(currentIAPrediction);
        } else {
            updateIAPanel('BLOCKED'); 
        }
    }
    
    renderer.render(scene, camera); 
}

function updateWaterPhysics(dt) {
    let openGatesCount = 0;
    sluiceGates.forEach(gate => {
        if (gate.position.y > 0.1) openGatesCount++;
    });

    if (openGatesCount > 0) {
        const drainSpeed = 0.05 * openGatesCount; 
        currentWaterLevel -= drainSpeed * dt;
    }

    if (currentWaterLevel < 0.2) {
        isResupplying = true;
        setSensorStatus("CRITICO");
    } else if (currentWaterLevel > 0.65) {
        isResupplying = false;
        setSensorStatus("NORMAL");
    }

    if (isResupplying) {
        currentWaterLevel += 0.2 * dt; 
    }

    if (currentWaterLevel < 0) currentWaterLevel = 0;
    if (currentWaterLevel > 0.7) currentWaterLevel = 0.7;

    updateLevelPanel(currentWaterLevel, isResupplying);
}

// ====================================================================
// 4. FUNÇÕES DE CONTROLO
// ====================================================================

function controlGate(index, isOpen) {
    if (isRaining && isOpen) { console.log("Bloqueio de Chuva."); return; }
    if (sluiceGates[index]) {
        const targetY = isOpen ? GATE_OPEN_Y : GATE_CLOSED_Y;
        sluiceGates[index].position.y = targetY;
        sluiceGates[index].rotation.x = isOpen ? -0.2 : 0; 
    }
}

function checkFarmerDemand() {
    if (isIAActive) {
        alert("Automação de IA ativa.");
        document.querySelectorAll('.farmer-input').forEach(chk => chk.checked = false);
        return; 
    }
    const checkboxes = document.querySelectorAll('.farmer-input');
    let activeCount = 0;
    checkboxes.forEach(chk => { if (chk.checked) activeCount++; });
    document.getElementById('farmer-count').innerText = `(${activeCount} Ativos)`;
    setGatesBasedOnDemand(activeCount);
}

function setGatesBasedOnDemand(activeCount) {
    if (isRaining) return;
    let g0 = false, g1 = false, g2 = false;
    if (activeCount > 0) g0 = true;
    if (activeCount > 3) g1 = true;
    if (activeCount > 6) g2 = true;
    controlGate(0, g0); controlGate(1, g1); controlGate(2, g2); 
}

function setAllGates(isOpen) {
    if (isRaining && isOpen) { alert("Sistema bloqueado por chuva."); return; }
    sluiceGates.forEach((_, index) => { controlGate(index, isOpen); });
}

function toggleRain() {
    isRaining = !isRaining;
    const btn = document.getElementById('btn-rain');
    const alertBox = document.getElementById('rain-alert');
    if (isRaining) {
        if (rainSystem) rainSystem.visible = true;
        btn.innerText = "PARAR CHUVA"; btn.style.backgroundColor = "#2196F3"; 
        scene.background = new THREE.Color(0x333333); 
        alertBox.style.display = "block";
        sluiceGates.forEach(gate => { if (gate) gate.position.y = GATE_CLOSED_Y; gate.rotation.x = 0; });
    } else {
        if (rainSystem) rainSystem.visible = false;
        btn.innerText = "ATIVAR CHUVA"; btn.style.backgroundColor = "#607D8B"; 
        scene.background = new THREE.Color(0x87CEEB);
        alertBox.style.display = "none";
        checkFarmerDemand();
    }
}

function updateLevelPanel(level, supplying) {
    const indicator = document.getElementById('level-indicator');
    const valueText = document.getElementById('level-value');
    let pct = Math.round((level / 0.7) * 100);

    if (supplying) {
        valueText.innerHTML = `ENCHENDO (${pct}%) <span style="font-size:10px; color:yellow;">▲ CENTRAL ATIVA</span>`;
        indicator.style.borderLeftColor = "#2196F3"; 
    } else if (level < 0.25) {
        valueText.innerText = `BAIXO (${pct}%)`;
        indicator.style.borderLeftColor = "#FFC107"; 
    } else {
        valueText.innerText = `NORMAL (${pct}%)`;
        indicator.style.borderLeftColor = "#4CAF50"; 
    }
}

function setSensorStatus(status) {
    if (!sensorLight) return;
    if (status === "CRITICO") {
        sensorLight.material.color.setHex(0xFF0000); 
        sensorLight.material.emissive.setHex(0xFF0000);
    } else {
        sensorLight.material.color.setHex(0x00FF00); 
        sensorLight.material.emissive.setHex(0x00FF00);
    }
}

function toggleIASimulation() {
    isIAActive = !isIAActive;
    const btn = document.getElementById('btn-ia-toggle');
    if (isIAActive) {
        btn.innerText = "DESATIVAR AUTOMAÇÃO POR IA"; btn.style.backgroundColor = "#D32F2F";
        iaStartTime = clock.getElapsedTime();
        document.querySelectorAll('.farmer-input').forEach(chk => chk.disabled = true);
    } else {
        btn.innerText = "ATIVAR AUTOMAÇÃO POR IA"; btn.style.backgroundColor = "#00897B";
        document.querySelectorAll('.farmer-input').forEach(chk => chk.disabled = false);
        const statusText = document.getElementById('ia-status'); statusText.innerText = "INATIVO"; statusText.style.color = "#9E9E9E";
    }
}
function updateIAPanel(prediction) {
    const statusText = document.getElementById('ia-status');
    if (prediction === 'BLOCKED') { statusText.innerText = "BLOQUEADO"; statusText.style.color = "#FF0000"; return; }
    statusText.innerText = `Probabilidade: ${prediction}%`;
    if (prediction > 70) { statusText.style.color = "#F44336"; statusText.innerText += " (ALTA)"; } 
    else if (prediction > 30) { statusText.style.color = "#FFC107"; } 
    else { statusText.style.color = "#4CAF50"; }
}
function actuateGatesByIAPrediction(prediction) {
    if (isRaining) return; 
    if (prediction <= 0) { controlGate(0, false); controlGate(1, false); controlGate(2, false); } 
    else if (prediction <= 30) { controlGate(0, true); controlGate(1, false); controlGate(2, false); } 
    else if (prediction <= 60) { controlGate(0, true); controlGate(1, true); controlGate(2, false); } 
    else { controlGate(0, true); controlGate(1, true); controlGate(2, true); }
}
function setWaterLevel(val) { console.log("Nível controlado automaticamente agora."); }


// ====================================================================
// 5. SHADERS E GEOMETRIA
// ====================================================================

const vertexShader = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fragmentShader = `
    uniform float time;
    uniform vec3 waterColor;
    varying vec2 vUv;
    float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
    void main() {
        vec2 uv_animado = vUv + vec2(0.0, time * 0.2); 
        float wave = random(floor(uv_animado * 10.0));
        vec3 color = waterColor + (wave * 0.1);
        gl_FragColor = vec4(color, 0.9);
    }
`;
function createCircleTexture(size = 64) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fillStyle = '#ffffff'; ctx.fill();
    return new THREE.CanvasTexture(canvas);
}
function createVegetation() {
    const PLANT_COUNT = 300; const vegetationMaterial = new THREE.MeshStandardMaterial({ color: 0x4CAF50 }); 
    const groundSurfaceY = 1.05; 
    for (let i = 0; i < PLANT_COUNT; i++) {
        const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 4);
        const isLeft = Math.random() < 0.5;
        const centralLimit = 3.5; const outerLimit = 50; 
        let randX = isLeft ? THREE.MathUtils.randFloat(-outerLimit, -centralLimit) : THREE.MathUtils.randFloat(centralLimit, outerLimit);
        const plant = new THREE.Mesh(geo, vegetationMaterial);
        plant.position.set(randX, groundSurfaceY + 0.25, THREE.MathUtils.randFloat(-25, 25));
        scene.add(plant);
    }
}

function createControlHouse() {
    const houseGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5);
    const houseMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    const house = new THREE.Mesh(houseGeo, houseMat);
    const xPos = (CHANNEL_WIDTH/2) + WALL_THICKNESS + 4; 
    const yPos = WALL_HEIGHT + (2.5/2) - 0.2; 
    house.position.set(xPos, yPos, 0); 
    scene.add(house);
    const doorGeo = new THREE.BoxGeometry(0.1, 1.8, 1);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(xPos - 1.25, yPos - 0.35, 0); 
    scene.add(door);
    const conduitGeo = new THREE.CylinderGeometry(0.05, 0.05, 4);
    const conduitMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const conduit = new THREE.Mesh(conduitGeo, conduitMat);
    conduit.rotation.z = Math.PI / 2; 
    conduit.position.set(xPos - 2, WALL_HEIGHT + 0.2, 0); 
    scene.add(conduit);
}

// --- SENSOR DE NÍVEL (POSIÇÃO CORRIGIDA) ---
function createLevelSensor() {
    const poleGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    const wallX = (CHANNEL_WIDTH / 2);
    
    // MUDANÇA AQUI: Z = -5 (Antes da comporta)
    const Z_POS = -5; 

    pole.position.set(wallX - 0.2, WALL_HEIGHT, Z_POS); 
    scene.add(pole);

    const sensorGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x0000AA }); 
    const sensor = new THREE.Mesh(sensorGeo, sensorMat);
    sensor.position.set(wallX - 0.6, WALL_HEIGHT + 0.5, Z_POS); 
    scene.add(sensor);

    const lightGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x00FF00, emissive: 0x00FF00 });
    sensorLight = new THREE.Mesh(lightGeo, lightMat);
    sensorLight.position.set(wallX - 0.6, WALL_HEIGHT + 0.5, Z_POS + 0.15); // Luz na face frontal
    scene.add(sensorLight);
}

function createChannel() {
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 });
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 1.0 });
    const walkwayMaterial = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.9 });
    const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x003366, metalness: 0.8, roughness: 0.2 });
    const cableMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const floorGeo = new THREE.BoxGeometry(CHANNEL_WIDTH, FLOOR_THICKNESS, CHANNEL_LENGTH);
    const floorMesh = new THREE.Mesh(floorGeo, concreteMaterial);
    floorMesh.position.set(0, -FLOOR_THICKNESS/2, 0); scene.add(floorMesh);

    const wallGeo = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CHANNEL_LENGTH);
    const wallY = WALL_HEIGHT / 2; 
    
    const leftWall = new THREE.Mesh(wallGeo, concreteMaterial);
    const wallOffset = (CHANNEL_WIDTH / 2) + (WALL_THICKNESS / 2);
    leftWall.position.set(-wallOffset, wallY, 0); scene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, concreteMaterial);
    rightWall.position.set(wallOffset, wallY, 0); scene.add(rightWall);

    const GROUND_SIZE = 100; 
    const groundGeo = new THREE.BoxGeometry(GROUND_SIZE, WALL_HEIGHT, CHANNEL_LENGTH);
    const leftGround = new THREE.Mesh(groundGeo, soilMaterial);
    leftGround.position.set(-wallOffset - (WALL_THICKNESS/2) - (GROUND_SIZE/2), wallY, 0); scene.add(leftGround);
    const rightGround = new THREE.Mesh(groundGeo, soilMaterial);
    rightGround.position.set(wallOffset + (WALL_THICKNESS/2) + (GROUND_SIZE/2), wallY, 0); scene.add(rightGround);
    createVegetation();
    createControlHouse();

    createLevelSensor();

    const walkwayGeo = new THREE.BoxGeometry(CHANNEL_WIDTH + 2, 0.1, 2);
    const walkway = new THREE.Mesh(walkwayGeo, walkwayMaterial);
    walkway.position.set(0, WALL_HEIGHT + 0.05, 0); scene.add(walkway);
    
    const railGeo = new THREE.BoxGeometry(CHANNEL_WIDTH + 2, 0.8, 0.05);
    const rail1 = new THREE.Mesh(railGeo, walkwayMaterial); rail1.position.set(0, WALL_HEIGHT + 0.5, 1); scene.add(rail1);
    const rail2 = new THREE.Mesh(railGeo, walkwayMaterial); rail2.position.set(0, WALL_HEIGHT + 0.5, -1); scene.add(rail2);

    const PART_COUNT = 3;
    const PART_WIDTH = (CHANNEL_WIDTH / PART_COUNT) - 0.2; 

    sluiceGates = [];
    waterMeshes = [];

    for (let i = 0; i < PART_COUNT; i++) {
        const xStart = -(CHANNEL_WIDTH / 2) + (PART_WIDTH / 2) + 0.1;
        const xPos = xStart + (i * (PART_WIDTH + 0.2));

        const waterGeo = new THREE.PlaneGeometry(PART_WIDTH, CHANNEL_LENGTH - 1);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0.0 }, waterColor: { value: new THREE.Color(0x0066ff) } },
            vertexShader: vertexShader, fragmentShader: fragmentShader, transparent: true, side: THREE.DoubleSide
        });
        const wMesh = new THREE.Mesh(waterGeo, waterMat);
        wMesh.position.set(xPos, 0.05, 0); 
        wMesh.userData = { flowTime: 0.0 };
        scene.add(wMesh);
        waterMeshes.push(wMesh);

        const gateGroup = new THREE.Group();
        gateGroup.position.set(xPos, GATE_CLOSED_Y, 0); 

        const gateGeo = new THREE.BoxGeometry(PART_WIDTH, WALL_HEIGHT, 0.1);
        const gateMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5 });
        const gatePlate = new THREE.Mesh(gateGeo, gateMat);
        gatePlate.position.y = WALL_HEIGHT / 2; 
        gateGroup.add(gatePlate);

        scene.add(gateGroup);
        sluiceGates.push(gateGroup);

        const motorGeo = new THREE.BoxGeometry(0.4, 0.5, 0.4);
        const motor = new THREE.Mesh(motorGeo, motorMaterial);
        motor.position.set(xPos, WALL_HEIGHT + 0.35, 0); 
        scene.add(motor);

        const cableGeo = new THREE.CylinderGeometry(0.01, 0.01, WALL_HEIGHT + 0.5);
        const cable1 = new THREE.Mesh(cableGeo, cableMaterial);
        cable1.position.set(xPos - 0.5, WALL_HEIGHT/2, 0); scene.add(cable1);
        const cable2 = new THREE.Mesh(cableGeo, cableMaterial);
        cable2.position.set(xPos + 0.5, WALL_HEIGHT/2, 0); scene.add(cable2);
    }
}

function createRain() {
    const rainCount = 10000; 
    const rainGeo = new THREE.BufferGeometry();
    const positions = [];
    for(let i = 0; i < rainCount; i++) positions.push((Math.random() - 0.5) * 80, Math.random() * 40, (Math.random() - 0.5) * 100);
    rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const circleTexture = createCircleTexture(64); 
    const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.2, transparent: true, map: circleTexture, depthWrite: false });
    rainSystem = new THREE.Points(rainGeo, rainMat);
    rainSystem.visible = false;
    scene.add(rainSystem);
}

init();