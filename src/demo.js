import * as THREE from '../node_modules/three/build/three.module.js';
// import Stats from '../vendor/stats.module.js';
import { GUI } from '../node_modules/dat.gui/build/dat.gui.module.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from '../node_modules/three/examples/jsm/lines/Line2.js';
// import * as MeshLine from '../vender/THREE.MeshLine.js';
import { LineMaterial } from '../node_modules/three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from '../node_modules/three/examples/jsm/lines/LineGeometry.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
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


/// Config contains the physical and visualization parameters
var Config = function () {
  this.Lz = 25.0;
  this.L3 = 20.0;
  this.MgR = 10.0;
  this.lambda_1 = 10.0;
  this.lambda_3 = 2.0;
  this.theta = 0.3;
  this.thetadot = 0.0;
  this.phi = 0.0;
  this.psi = 0.0;
  this.dt = 0.01;
  this.run = false;
}
var conf = new Config();

/// Setting up the scene
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// THREE.Object3D.DefaultUp.set(0.5,0.0,0.8);
var camera = new THREE.PerspectiveCamera(30, width / height, 1, 1000);
var camera_d = 12;
camera.position.z = camera_d * Math.cos(80 * Math.PI / 180);
camera.position.x = camera_d * Math.sin(80 * Math.PI / 180);
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

// Instantiate a loader
const loader = new GLTFLoader();

// // Optional: Provide a DRACOLoader instance to decode compressed mesh data
// const dracoLoader = new DRACOLoader();
// dracoLoader.setDecoderPath( '/examples/jsm/libs/draco/' );
// loader.setDRACOLoader( dracoLoader );

var top, box, pivot;
var set_rotation;

// Load a glTF resource
loader.load(
  // resource URL
  '../model/scene.gltf',
  // called when the resource is loaded
  function ( gltf ) {
    console.log(gltf.scene);
    scene.add( gltf.scene );
    // scene.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), Math.PI/2);

    top = scene.getObjectByName('Foreverspin_0');
    console.log(top.position);
    console.log(top);
    // top.material = new THREE.MeshStandardMaterial(color=0xffffff);
    top.material.metalness = 0.8;
    top.translateZ(0.67);

    // box = new THREE.Box3().setFromObject( top );
    // box.getCenter( top.position ); // this re-sets the mesh position
    // top.position.multiplyScalar( - 1 );
    pivot = new THREE.Group();
    pivot.position.set( 0.0, 0.0, 0.0 ); // MOVE THE PIVOT BACK TO WORLD ORIGN
    scene.add(pivot);
    pivot.add(top);
    // pivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), conf.theta);
    set_rotation = function ( phi, theta, psi ) {
      var c1 = Math.cos(phi);
      var c2 = Math.cos(theta);
      var c3 = Math.cos(psi);
      var s1 = Math.sin(phi);
      var s2 = Math.sin(theta);
      var s3 = Math.sin(psi);

      // var q1 = new THREE.Quaternion();
      // q1.setFromAxisAngle(new THREE.Vector3(0, 0, 1), )
      // console.log(pivot);
      pivot.setRotationFromMatrix(new THREE.Matrix4(c1*c3 - c2*s1*s3, -c1*s3-c2*c3*s1, s1*s2, 0,
                                                    c3*s1 + c1*c2*s3, c1*c2*c3 - s1*s3, -c1*s2, 0,
                                                    s2*s3, c3*s2, c2, 0,
                                                    0, 0, 0, 1));
    }

    set_rotation(conf.phi, conf.theta, conf.psi);

    const axesHelper = new THREE.AxesHelper( 5 );
    scene.add( axesHelper );
    // top.material.color.setHex(0xffffff);
    // top = gltf.scene.children;
    // console.log(top);
    // top.material = new THREE.MeshPhongMaterial({color: 0x00ff00});
    animate();
  },
  // called while loading is progressing
  function ( xhr ) {
    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
  },
  // called when loading has errors
  function ( error ) {
    console.log( 'An error happened' );
    console.error(error);
  }
);

const gui = new GUI();
gui.add(conf, 'Lz', 0.0, 100.0).name('Lz');
gui.add(conf, 'L3', 0.0, 100.0).name('L3');
gui.add(conf, 'MgR', 0.0, 100.0).name('MgR');
gui.add(conf, 'lambda_1', 0.0, 100.0).name('lambda_1');
gui.add(conf, 'lambda_3', 0.0, 100.0).name('lambda_3');
gui.add(conf, 'theta', 0.0, Math.PI).name('theta').listen();
gui.add(conf, 'dt', 0.001, 0.1).name('dt').listen();
gui.add(conf, 'run').name('Run').listen().onChange(start_stop_integration);

var phi = 0.0;
var psi = 0.0;
var dt = 0.001;

var derives = function(x, y) {
  var Lz = conf.Lz;
  var L3 = conf.L3;
  var MgR = conf.MgR;
  var l1 = conf.lambda_1;
  var l3 = conf.lambda_3;
  var theta = conf.theta;

  var theta = y[0]
  var theta_dot = y[1]
  var phi = y[2]
  var psi = y[3]
  var sth = Math.sin(theta)
  var cth = Math.cos(theta)
  var dtheta_dt = theta_dot
  var dphi_dt = (Lz - L3 * cth) / (l1 * sth**2)
  var dpsi_dt = L3 / l3 - dphi_dt * cth
  var dtheta_dot_dt = dphi_dt**2 * sth * cth - l3 / l1 * (dpsi_dt + dphi_dt * cth) * dphi_dt * sth + MgR * sth / l1
  return [dtheta_dt, dtheta_dot_dt, dphi_dt, dpsi_dt]
}

var rk4 = new RungeKutta4(derives, 0.0, [conf.theta, conf.thetadot, conf.phi, conf.psi], dt);

var start_stop_integration = function() {
  if (conf.run) {
    rk4 = new RungeKutta4(derives, 0.0, [conf.theta, conf.thetadot, conf.phi, conf.psi], dt)
  }
}

function animate() {
  requestAnimationFrame(animate, canvas);

  if (conf.run) {
    var y = rk4.steps(Math.floor(conf.dt/dt));
    conf.theta = y[0];
    conf.phi = y[2];
    conf.psi = y[3];
  }
  set_rotation(conf.phi, conf.theta, conf.psi);

  renderer.render(scene, camera);
  controls.update();
}

// animate();
