import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'https://cdn.skypack.dev/gsap';

export function initViewer(containerId, modelPath, modelFile) {
    const container = document.getElementById(containerId);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(1000, 500);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // Set white background

    // Camera
    const camera = new THREE.PerspectiveCamera(5, 1000 / 500, 0.1, 200);
    camera.position.set(5, -10, 25);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(hemisphereLight);

    // Load 3D Model
    const loader = new GLTFLoader().setPath(modelPath);
    let bee, mixer;

    loader.load(
        modelFile,
        (gltf) => {
            bee = gltf.scene;
            scene.add(bee);

            // Enable animations if the model has them
            if (gltf.animations && gltf.animations.length) {
                mixer = new THREE.AnimationMixer(bee);
                mixer.clipAction(gltf.animations[0]).play();
            }

            bee.traverse((node) => {
                if (node.isMesh) {
                    node.material.needsUpdate = true; // Retain original textures
                    node.castShadow = true; // Enable shadows
                    node.receiveShadow = true;
                }
            });

            // Set initial position and rotation
            bee.position.set(0, -1, 0);
            bee.rotation.set(0, -1, 0);

            // Add subtle dynamic movement
            subtleMovement();
        },
        (xhr) => console.log(`Loading ${containerId}: ${(xhr.loaded / xhr.total) * 100}%`),
        (error) => console.error(`Error loading ${containerId}:`, error)
    );

    // Subtle movement
    function subtleMovement() {
        if (!bee) return;

        // Slight up-and-down motion
        gsap.to(bee.position, {
            y: bee.position.y + 0.2,
            duration: 1.5,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
        });

        // Slight rotation to simulate hovering
        gsap.to(bee.rotation, {
            z: bee.rotation.z + 0.05,
            duration: 1,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
        });
    }

    // Resize handling
    window.addEventListener('resize', () => {
        renderer.setSize(1000, 500);
        camera.aspect = 1000 / 500;
        camera.updateProjectionMatrix();
    });

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);

        // Update mixer if animations are active
        if (mixer) mixer.update(0.01);

        controls.update();
        renderer.render(scene, camera);
    }

    animate();
}
