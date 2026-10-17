// RobotWar — post-elaborazione: bagliore (bloom) su luci, scariche ed esplosioni
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.attivo = false;
    this.composer = new EffectComposer(renderer);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.9);
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  ridimensiona() {
    this.composer.setPixelRatio(this.r.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
  }

  render(scena, camera) {
    if (!this.attivo) { this.r.render(scena, camera); return; }
    this.pass.scene = scena;
    this.pass.camera = camera;
    this.composer.render();
  }
}
