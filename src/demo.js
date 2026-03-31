import * as THREE from '../node_modules/three/build/three.module.js';
// import Stats from '../vendor/stats.module.js';
import { GUI } from '../node_modules/dat.gui/build/dat.gui.module.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from '../node_modules/three/examples/jsm/lines/Line2.js';
// import * as MeshLine from '../vender/THREE.MeshLine.js';
import { LineMaterial } from '../node_modules/three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from '../node_modules/three/examples/jsm/lines/LineGeometry.js';
// import { RungeKutta4 } from '../node_modules/runge-kutta-4/dist/runge-kutta-4.min.js';
var RungeKutta4 = require('runge-kutta-4')

const width = window.innerWidth;
const height = window.innerHeight;
const aspect = width / height;
const canvas = document.getElementById("vis");
var renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true
});
renderer.setSize(width, height);


// Compute phi_dot for steady precession (theta_ddot = 0) given theta, psi_dot, and physical params.
// Solves: l1 cos(theta) phi_dot^2 - l3*(psi_dot + phi_dot*cos(theta))*phi_dot + MgR = 0
// Returns slow precession solution, or null if no real root.
function steadyPhiDot(theta, psi_dot, MgR, l1, l3) {
  var cth = Math.cos(theta);
  // L3 = l3*(psi_dot + phi_dot*cth), so the quadratic in phi_dot is:
  // (l1*cth - l3*cth^2)*phi_dot^2 - l3*psi_dot*cth*phi_dot + MgR = 0
  var a = l1 * cth - l3 * cth * cth;
  var b = -l3 * psi_dot * cth;
  var c = MgR;
  var disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  // Slow precession = smaller root
  return (-b - Math.sqrt(disc)) / (2 * a);
}

/// Config contains the physical and visualization parameters
var Config = function () {
  this.MgR = 10.0;
  this.lambda_1 = 10.0;
  this.lambda_3 = 2.0;
  this.theta = 0.4;
  this.theta_dot = 0.0;
  this.psi_dot = 15.0;
  this.phi_dot = steadyPhiDot(this.theta, this.psi_dot, this.MgR, this.lambda_1, this.lambda_3);
  this.phi = 0.0;
  this.psi = 0.0;
  this.dt = 0.01;
  // Conserved quantities (computed when Run is pressed)
  this.Lz = 0.0;
  this.L3 = 0.0;
  this.showAngles = true;
  this.run = false;
  this.running = false;
}
var conf = new Config();

/// Setting up the scene
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// THREE.Object3D.DefaultUp.set(0.5,0.0,0.8);
var camera = new THREE.PerspectiveCamera(30, width / height, 1, 1000);
var camera_d = 12;
camera.position.z = camera_d * Math.cos(50 * Math.PI / 180);
camera.position.x = camera_d * Math.sin(50 * Math.PI / 180) * Math.cos(45 * Math.PI / 180);
camera.position.y = camera_d * Math.sin(50 * Math.PI / 180) * Math.sin(45 * Math.PI / 180);
camera.up.set(0, 0, 1);
camera.lookAt(new THREE.Vector3(0, 0, 0));

var controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableKeys = false;

/// Add lighting to the star and other meshes
var directionalLight = new THREE.DirectionalLight(0xffffffff);
directionalLight.position.set(107, 107, 107);
scene.add(directionalLight);

var light = new THREE.AmbientLight(0xffffff); // soft white light
scene.add(light);

/// Build the wheel + axle model
var pivot;
var set_rotation;

// Dimensions
var axleLength = 2.0;
var axleRadius = 0.03;
var rimRadius = 0.8;
var rimTube = 0.04;
var spokeRadius = 0.025;
var numSpokes = 4;

var wheelGroup = new THREE.Group();

// Axle: cylinder along local Z from 0 to axleLength
var axleGeo = new THREE.CylinderGeometry(axleRadius, axleRadius, axleLength, 16);
var axleMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.3 });
var axleMesh = new THREE.Mesh(axleGeo, axleMat);
// CylinderGeometry is along Y by default; rotate to align with Z
axleMesh.rotation.x = Math.PI / 2;
axleMesh.position.z = axleLength / 2;
wheelGroup.add(axleMesh);

// Rim (torus) at the end of the axle
var rimGeo = new THREE.TorusGeometry(rimRadius, rimTube, 16, 64);
var rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5, roughness: 0.3 });
var rimMesh = new THREE.Mesh(rimGeo, rimMat);
rimMesh.position.z = axleLength;
wheelGroup.add(rimMesh);

// Spokes: radial cylinders in the wheel plane
var spokeMat = new THREE.MeshStandardMaterial({ color: 0xdd4444, metalness: 0.4, roughness: 0.4 });
for (var i = 0; i < numSpokes; i++) {
  var angle = (i / numSpokes) * Math.PI * 2;
  var spokeGeo = new THREE.CylinderGeometry(spokeRadius, spokeRadius, rimRadius, 8);
  var spoke = new THREE.Mesh(spokeGeo, spokeMat);
  // Position at midpoint of the spoke, at the wheel plane
  spoke.position.set(
    Math.cos(angle) * rimRadius / 2,
    Math.sin(angle) * rimRadius / 2,
    axleLength
  );
  // Rotate so the cylinder axis points radially outward
  spoke.rotation.z = angle - Math.PI / 2;
  wheelGroup.add(spoke);
}

// Small hub at the wheel center
var hubGeo = new THREE.SphereGeometry(0.06, 16, 16);
var hubMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.3 });
var hubMesh = new THREE.Mesh(hubGeo, hubMat);
hubMesh.position.z = axleLength;
wheelGroup.add(hubMesh);

// Pivot group at origin for Euler angle rotation
pivot = new THREE.Group();
pivot.position.set(0.0, 0.0, 0.0);
scene.add(pivot);
pivot.add(wheelGroup);

set_rotation = function (phi, theta, psi) {
  var c1 = Math.cos(phi);
  var c2 = Math.cos(theta);
  var c3 = Math.cos(psi);
  var s1 = Math.sin(phi);
  var s2 = Math.sin(theta);
  var s3 = Math.sin(psi);

  // ZYZ convention: R = Rz(phi) * Ry(theta) * Rz(psi)
  // Body 3-axis projects to (cos(phi), sin(phi)) in xy-plane
  pivot.setRotationFromMatrix(new THREE.Matrix4(
    c1*c2*c3 - s1*s3, -c1*c2*s3 - s1*c3, c1*s2, 0,
    s1*c2*c3 + c1*s3, -s1*c2*s3 + c1*c3, s1*s2, 0,
   -s2*c3,             s2*s3,              c2,    0,
    0,                  0,                  0,    1
  ));
}

set_rotation(conf.phi, conf.theta, conf.psi);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

/// Euler angle visualization
var angleVisGroup = new THREE.Group();
scene.add(angleVisGroup);
angleVisGroup.visible = conf.showAngles;

var numArcPts = 64;

function makeTextSprite(text, color) {
  var canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'Bold 48px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  var texture = new THREE.CanvasTexture(canvas);
  var mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  var sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.5, 0.25, 1);
  return sprite;
}

function makeArcLine(color) {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(numArcPts * 3), 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color }));
}

function makeDashedLine(color) {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
  var line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: color, dashSize: 0.1, gapSize: 0.05 }));
  line.computeLineDistances();
  return line;
}

var phiArc = makeArcLine(0x4488ff);
var thetaArc = makeArcLine(0x44ff88);
var psiArc = makeArcLine(0xff6644);
var nodalLine = makeDashedLine(0xffffff);
angleVisGroup.add(phiArc, thetaArc, psiArc, nodalLine);

var phiLabel = makeTextSprite('\u03d5', '#4488ff');
var thetaLabel = makeTextSprite('\u03b8', '#44ff88');
var psiLabel = makeTextSprite('\u03c8', '#ff6644');
angleVisGroup.add(phiLabel, thetaLabel, psiLabel);

function updateAngleVis() {
  if (!angleVisGroup.visible) return;

  var phi = conf.phi;
  var theta = conf.theta;
  var psi = conf.psi;
  var cph = Math.cos(phi), sph = Math.sin(phi);
  var cth = Math.cos(theta), sth = Math.sin(theta);

  // ZYZ convention: line of nodes is y' = (-sin phi, cos phi, 0)
  // Body 3-axis: e3 = (cos(phi)*sin(theta), sin(phi)*sin(theta), cos(theta))
  var Nx = -sph, Ny = cph;
  var pos = nodalLine.geometry.attributes.position.array;
  pos[0] = 0; pos[1] = 0; pos[2] = 0;
  pos[3] = 2.5 * cph; pos[4] = 2.5 * sph; pos[5] = 0;
  nodalLine.geometry.attributes.position.needsUpdate = true;
  nodalLine.computeLineDistances();

  // phi arc: xy-plane, from x-axis to body axis projection (angle phi)
  var phiMod = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  var r_phi = 1.2;
  pos = phiArc.geometry.attributes.position.array;
  for (var i = 0; i < numArcPts; i++) {
    var t = (i / (numArcPts - 1)) * phiMod;
    pos[i * 3]     = r_phi * Math.cos(t);
    pos[i * 3 + 1] = r_phi * Math.sin(t);
    pos[i * 3 + 2] = 0;
  }
  phiArc.geometry.attributes.position.needsUpdate = true;
  var tMid = phiMod / 2;
  phiLabel.position.set(r_phi * 1.2 * Math.cos(tMid), r_phi * 1.2 * Math.sin(tMid), 0);

  // theta arc: from z-axis toward body 3-axis, sweeping about y' = (-sin phi, cos phi, 0)
  // p(t) = r * (cos(phi)*sin(t), sin(phi)*sin(t), cos(t))
  var r_theta = 1.5;
  pos = thetaArc.geometry.attributes.position.array;
  for (var i = 0; i < numArcPts; i++) {
    var t = (i / (numArcPts - 1)) * theta;
    pos[i * 3]     = r_theta * cph * Math.sin(t);
    pos[i * 3 + 1] = r_theta * sph * Math.sin(t);
    pos[i * 3 + 2] = r_theta * Math.cos(t);
  }
  thetaArc.geometry.attributes.position.needsUpdate = true;
  tMid = theta / 2;
  thetaLabel.position.set(
    r_theta * 1.15 * cph * Math.sin(tMid),
    r_theta * 1.15 * sph * Math.sin(tMid),
    r_theta * 1.15 * Math.cos(tMid)
  );

  // psi arc: in the body xy-plane at the wheel, from line of nodes to body y-axis
  // Center at axleLength along body 3-axis
  // Reference: N = y' = (-sin phi, cos phi, 0), perpendicular to e3
  // e3 x N = (-cth*cph, -cth*sph, sth)
  var psiMod = ((psi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  var r_psi = 0.5;
  var e3x = cph * sth, e3y = sph * sth, e3z = cth;
  var e3xNx = -cth * cph, e3xNy = -cth * sph, e3xNz = sth;
  var cx = axleLength * e3x, cy = axleLength * e3y, cz = axleLength * e3z;
  pos = psiArc.geometry.attributes.position.array;
  for (var i = 0; i < numArcPts; i++) {
    var t = (i / (numArcPts - 1)) * psiMod;
    var ct = Math.cos(t), st = Math.sin(t);
    pos[i * 3]     = cx + r_psi * (ct * Nx + st * e3xNx);
    pos[i * 3 + 1] = cy + r_psi * (ct * Ny + st * e3xNy);
    pos[i * 3 + 2] = cz + r_psi * (st * e3xNz);
  }
  psiArc.geometry.attributes.position.needsUpdate = true;
  tMid = psiMod / 2;
  var ctm = Math.cos(tMid), stm = Math.sin(tMid);
  psiLabel.position.set(
    cx + r_psi * 1.4 * (ctm * Nx + stm * e3xNx),
    cy + r_psi * 1.4 * (ctm * Ny + stm * e3xNy),
    cz + r_psi * 1.4 * (stm * e3xNz)
  );
}

animate();

const gui = new GUI();
gui.add(conf, 'MgR', 0.0, 100.0).name('MgR');
gui.add(conf, 'lambda_1', 0.0, 100.0).name('lambda_1');
gui.add(conf, 'lambda_3', 0.0, 100.0).name('lambda_3');
gui.add(conf, 'theta', 0.01, Math.PI).name('theta').listen();
gui.add(conf, 'phi_dot', -10.0, 10.0).name('phi_dot').listen();
gui.add(conf, 'theta_dot', -10.0, 10.0).name('theta_dot').listen();
gui.add(conf, 'psi_dot', 0.0, 50.0).name('psi_dot').listen();
gui.add(conf, 'dt', 0.001, 0.1).name('dt').listen();
gui.add({ setSteady: function() {
  var pd = steadyPhiDot(conf.theta, conf.psi_dot, conf.MgR, conf.lambda_1, conf.lambda_3);
  if (pd !== null) conf.phi_dot = pd;
}}, 'setSteady').name('Set steady precession');
gui.add(conf, 'Lz').name('Lz (conserved)').listen().domElement.style.pointerEvents = 'none';
gui.add(conf, 'L3').name('L3 (conserved)').listen().domElement.style.pointerEvents = 'none';
gui.add(conf, 'showAngles').name('Show Euler angles').onChange(function(v) {
  angleVisGroup.visible = v;
});
gui.add({ reset: function() {
  conf.running = false;
  conf.run = false;
  var defaults = new Config();
  conf.MgR = defaults.MgR;
  conf.lambda_1 = defaults.lambda_1;
  conf.lambda_3 = defaults.lambda_3;
  conf.theta = defaults.theta;
  conf.theta_dot = defaults.theta_dot;
  conf.psi_dot = defaults.psi_dot;
  conf.phi_dot = defaults.phi_dot;
  conf.phi = defaults.phi;
  conf.psi = defaults.psi;
  conf.dt = defaults.dt;
  conf.Lz = 0.0;
  conf.L3 = 0.0;
  rk4 = null;
  // Reset GUI sliders to match
  for (var i in gui.__controllers) {
    gui.__controllers[i].updateDisplay();
  }
}}, 'reset').name('Reset');

var dt = 0.001;

// Lz and L3 are fixed during integration; captured in a closure by makeDerivs
function makeDerivs(Lz, L3, MgR, l1, l3) {
  return function(x, y) {
    var theta = y[0]
    var theta_dot = y[1]
    var sth = Math.sin(theta)
    var cth = Math.cos(theta)
    var sth2 = sth * sth
    var dtheta_dt = theta_dot

    // Handle coordinate singularity at theta = 0, pi
    var dphi_dt;
    if (sth2 > 1e-12) {
      dphi_dt = (Lz - L3 * cth) / (l1 * sth2);
    } else {
      dphi_dt = L3 / (l1 * (1 + cth));
    }

    var dpsi_dt = L3 / l3 - dphi_dt * cth
    var dtheta_dot_dt = dphi_dt**2 * sth * cth - l3 / l1 * (dpsi_dt + dphi_dt * cth) * dphi_dt * sth + MgR * sth / l1
    return [dtheta_dt, dtheta_dot_dt, dphi_dt, dpsi_dt]
  }
}

var rk4 = null;

var start_stop_integration = function() {
  if (conf.run) {
    // Compute conserved quantities from initial angular velocities
    var l1 = conf.lambda_1;
    var l3 = conf.lambda_3;
    var cth = Math.cos(conf.theta);
    var sth = Math.sin(conf.theta);
    conf.L3 = l3 * (conf.psi_dot + conf.phi_dot * cth);
    conf.Lz = l1 * conf.phi_dot * sth * sth + conf.L3 * cth;
    var derives = makeDerivs(conf.Lz, conf.L3, conf.MgR, l1, l3);
    rk4 = new RungeKutta4(derives, 0.0, [conf.theta, conf.theta_dot, conf.phi, conf.psi], dt);
    conf.running = true;
  } else {
    conf.running = false;
  }
}

gui.add(conf, 'run').name('Run').listen().onChange(start_stop_integration);

function animate() {
  requestAnimationFrame(animate, canvas);

  if (conf.running) {
    var y = rk4.steps(Math.floor(conf.dt/dt));
    conf.theta = y[0];
    conf.theta_dot = y[1];
    conf.phi = y[2];
    conf.psi = y[3];
    // Recover angular velocities from conserved quantities
    var sth = Math.sin(conf.theta);
    var cth = Math.cos(conf.theta);
    var sth2 = sth * sth;
    if (sth2 > 1e-12) {
      conf.phi_dot = (conf.Lz - conf.L3 * cth) / (conf.lambda_1 * sth2);
    } else {
      conf.phi_dot = conf.L3 / (conf.lambda_1 * (1 + cth));
    }
    conf.psi_dot = conf.L3 / conf.lambda_3 - conf.phi_dot * cth;
  }
  set_rotation(conf.phi, conf.theta, conf.psi);
  updateAngleVis();

  renderer.render(scene, camera);
  controls.update();
}

// animate();
