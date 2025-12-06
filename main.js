// ====================================================================
// 1. VARIÁVEIS GLOBAIS
// ====================================================================

let scene, camera, renderer, clock; 
let sluiceGates = []; 
let waterMeshes = []; 
let rainSystem;
let isRaining = false; 

// --- MEDIDAS FIXAS SOLICITADAS ---
const CHANNEL_LENGTH = 50;  
const CHANNEL_WIDTH = 6; 
const WALL_HEIGHT = 1;    
const WALL_THICKNESS = 0.5; 
const FLOOR_THICKNESS = 0.5;

const GATE_CLOSED_Y = 0.0; 
const GATE_OPEN_Y = 1.0;   
const SECTION_COLORS = [0xFF0000, 0x00FF00, 0x0000FF]; 

// ====================================================================
// 2. INICIALIZAÇÃO
// ====================================================================

function init() {
    scene = new THREE.Scene();
    // Céu azul claro para contrastar com a terra
    scene.background = new THREE.Color(0x87CEEB); 
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // --- POSIÇÃO DA CÂMARA (MANTIDA) ---
    camera.position.set(7, 5, -2); 
    camera.lookAt(0, 0, 1); 
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Sombra suave
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement); 

    // Luzes
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
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
    
    waterMeshes.forEach((mesh, index) => {
        const gate = sluiceGates[index];
        const isOpen = gate.position.y > 0.1;

        if (isOpen) {
            mesh.userData.flowTime += deltaTime;
            mesh.material.uniforms.time.value = mesh.userData.flowTime;
        }
    });

    if (isRaining && rainSystem) {
        const positions = rainSystem.geometry.attributes.position.array;
        for(let i = 1; i < positions.length; i += 3) {
            positions[i] -= 0.8; 
            if (positions[i] < -2) {
                positions[i] = 20; 
            }
        }
        rainSystem.geometry.attributes.position.needsUpdate = true;
    }
    
    renderer.render(scene, camera); 
}

// ====================================================================
// 4. LÓGICA DE CONTROLO E AGRICULTORES
// ====================================================================

function checkFarmerDemand() {
    if (isRaining) return; 

    const checkboxes = document.querySelectorAll('.farmer-input');
    let activeCount = 0;
    checkboxes.forEach(chk => { if (chk.checked) activeCount++; });

    document.getElementById('farmer-count').innerText = `(${activeCount} Ativos)`;

    if (activeCount === 0) {
        controlGate(0, false); controlGate(1, false); controlGate(2, false);
    } else if (activeCount <= 3) {
        controlGate(0, true); controlGate(1, false); controlGate(2, false);
    } else if (activeCount <= 6) {
        controlGate(0, true); controlGate(1, true); controlGate(2, false);
    } else {
        controlGate(0, true); controlGate(1, true); controlGate(2, true);
    }
}

function controlGate(index, isOpen) {
    if (isRaining && isOpen) return; 
    if (sluiceGates[index]) {
        const targetY = isOpen ? GATE_OPEN_Y : GATE_CLOSED_Y;
        sluiceGates[index].position.y = targetY;
    }
}

function setAllGates(isOpen) {
    if (isRaining && isOpen) {
        alert("Sistema bloqueado por chuva.");
        return;
    }
    sluiceGates.forEach((_, index) => {
        controlGate(index, isOpen);
    });
}

function toggleRain() {
    isRaining = !isRaining;
    const btn = document.getElementById('btn-rain');
    const alertBox = document.getElementById('rain-alert');

    if (isRaining) {
        if (rainSystem) rainSystem.visible = true;
        btn.innerText = "PARAR CHUVA";
        btn.style.backgroundColor = "#2196F3"; 
        scene.background = new THREE.Color(0x333333); // Céu escuro de tempestade
        alertBox.style.display = "block";
        sluiceGates.forEach(gate => gate.position.y = GATE_CLOSED_Y);
    } else {
        if (rainSystem) rainSystem.visible = false;
        btn.innerText = "ATIVAR CHUVA";
        btn.style.backgroundColor = "#607D8B"; 
        scene.background = new THREE.Color(0x87CEEB); // Céu azul
        alertBox.style.display = "none";
        checkFarmerDemand();
    }
}

function setWaterLevel(level) {
    const indicator = document.getElementById('level-indicator');
    const valueText = document.getElementById('level-value');
    switch(level) {
        case 'LOW':
            valueText.innerText = "BAIXO"; indicator.style.borderLeftColor = "#FFC107"; break;
        case 'NORMAL':
            valueText.innerText = "NORMAL"; indicator.style.borderLeftColor = "#4CAF50"; break;
        case 'FULL':
            valueText.innerText = "CHEIO"; indicator.style.borderLeftColor = "#F44336"; break;
    }
}

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

function createChannel() {
    // Materiais
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0.1 });
    // Material de Solo (Marrom terra)
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 1.0 });

    // --- 1. ESTRUTURA DO CANAL (CONCRETO) ---
    
    // Base/Chão do canal
    const floorGeo = new THREE.BoxGeometry(CHANNEL_WIDTH, FLOOR_THICKNESS, CHANNEL_LENGTH);
    const floorMesh = new THREE.Mesh(floorGeo, concreteMaterial);
    floorMesh.position.set(0, -FLOOR_THICKNESS/2, 0);
    scene.add(floorMesh);

    // Paredes
    const wallGeo = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CHANNEL_LENGTH);
    // Calculamos o centro Y da parede para que ela "nasça" do chão
    // O chão termina em y=0. A parede tem 1.3m. Centro em y=0.65.
    const wallY = WALL_HEIGHT / 2; 
    
    const leftWall = new THREE.Mesh(wallGeo, concreteMaterial);
    const wallOffset = (CHANNEL_WIDTH / 2) + (WALL_THICKNESS / 2);
    leftWall.position.set(-wallOffset, wallY, 0);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, concreteMaterial);
    rightWall.position.set(wallOffset, wallY, 0);
    scene.add(rightWall);

    // --- 2. SOLO (TERRENO) ---
    // Criamos dois grandes blocos de terra laterais nivelados com o topo da parede
    const GROUND_SIZE = 100; // Largura do terreno
    const groundGeo = new THREE.BoxGeometry(GROUND_SIZE, WALL_HEIGHT, CHANNEL_LENGTH);
    
    // Solo Esquerdo
    const leftGround = new THREE.Mesh(groundGeo, soilMaterial);
    // Posição: Encostado na parede esquerda
    // Wall X = -wallOffset. Ground Center = -wallOffset - (Metade Parede) - (Metade Solo)
    const leftGroundX = -wallOffset - (WALL_THICKNESS/2) - (GROUND_SIZE/2);
    leftGround.position.set(leftGroundX, wallY, 0);
    scene.add(leftGround);

    // Solo Direito
    const rightGround = new THREE.Mesh(groundGeo, soilMaterial);
    const rightGroundX = wallOffset + (WALL_THICKNESS/2) + (GROUND_SIZE/2);
    rightGround.position.set(rightGroundX, wallY, 0);
    scene.add(rightGround);

    // --- 3. ELEMENTOS INTERNOS (ÁGUA E COMPORTAS) ---
    const PART_COUNT = 3;
    const PART_WIDTH = (CHANNEL_WIDTH / PART_COUNT) - 0.2; 

    sluiceGates = [];
    waterMeshes = [];

    for (let i = 0; i < PART_COUNT; i++) {
        const xStart = -(CHANNEL_WIDTH / 2) + (PART_WIDTH / 2) + 0.1;
        const xPos = xStart + (i * (PART_WIDTH + 0.2));

        // Água
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

        // Comporta
        // Aumentamos a altura da comporta para ser visível acima do novo nível do solo
        const gateGeo = new THREE.BoxGeometry(PART_WIDTH, WALL_HEIGHT + 0.5, 0.2);
        const gateMat = new THREE.MeshStandardMaterial({ color: SECTION_COLORS[i], roughness: 0.2 });
        const gateMesh = new THREE.Mesh(gateGeo, gateMat);
        
        // Ajuste fino para a comporta ficar "enterrada" no fluxo fechado mas visível no topo
        gateMesh.position.y = GATE_CLOSED_Y + (WALL_HEIGHT/2) + 0.2;
        gateMesh.position.x = xPos;
        scene.add(gateMesh);
        sluiceGates.push(gateMesh);
    }
}

function createRain() {
    const rainCount = 10000; 
    const rainGeo = new THREE.BufferGeometry();
    const positions = [];
    for(let i = 0; i < rainCount; i++) {
        positions.push((Math.random() - 0.5) * 80, Math.random() * 40, (Math.random() - 0.5) * 100);
    }
    rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1, transparent: true });
    rainSystem = new THREE.Points(rainGeo, rainMat);
    rainSystem.visible = false;
    scene.add(rainSystem);
}

init();