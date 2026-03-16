// ASG Portfolio SDF Ray March demo
// March 5, 2026
// Arjun Singh Gill

// Get the canvas
const canvas = document.getElementById("sdf_ray_march_canvas");
// Set the canvas width
canvas.width = window.innerWidth*window.devicePixelRatio;
canvas.height = window.innerHeight*window.devicePixelRatio;
// Set the canvas style
canvas.style.width  = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
// Align the canvas to always stay on top left corner of the screen
// canvas.style.position = 'fixed';
// canvas.style.top = 0;
// canvas.style.left = 0;
// // Set zIndex so that HTML elements stay on top of the canvas
// canvas.style.zIndex = -5;

// Get the WebgL2 Context
const CTX_GL2 = canvas.getContext("webgl2");

// A simple vertex shader source code
const vss = 
`#version 300 es

in vec4 a_position;

void main() {
  gl_Position = a_position;
}
`;

const fss = 
`#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_mouse_pos;
uniform float u_time;

// we need to declare an output for the fragment shader
out vec4 outColor;

// SDF Ray Marching Code Starts Here


mat3 rotateX(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(1, 0, 0),
        vec3(0, c, -s),
        vec3(0, s, c)
    );
}

// Rotation matrix around the Y axis.
mat3 rotateY(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s, 0, c)
    );
}

// Rotation matrix around the Z axis.
mat3 rotateZ(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, -s, 0),
        vec3(s, c, 0),
        vec3(0, 0, 1)
    );
}

// Identity matrix.
mat3 identity() {
    return mat3(
        vec3(1, 0, 0),
        vec3(0, 1, 0),
        vec3(0, 0, 1)
    );
}


const int MAX_MARCHING_STEPS = 255;
const float MIN_DIST = 0.0;
const float MAX_DIST = 100.0;
const float PRECISION = 0.001;
const float PI = 3.14159;

struct Material {
  vec3 ambientColor; // k_a * i_a
  vec3 diffuseColor; // k_d * i_d
  vec3 specularColor; // k_s * i_s
  float alpha; // shininess
};

Material gold() {
  vec3 aCol = 0.5 * vec3(0.7, 0.5, 0);
  vec3 dCol = 0.6 * vec3(0.7, 0.7, 0);
  vec3 sCol = 0.6 * vec3(1, 1, 1);
  float a = 5.;

  return Material(aCol, dCol, sCol, a);
}

Material silver() {
  vec3 aCol = 0.4 * vec3(0.8);
  vec3 dCol = 0.5 * vec3(0.7);
  vec3 sCol = 0.6 * vec3(1, 1, 1);
  float a = 5.;

  return Material(aCol, dCol, sCol, a);
}

Material checkerboard(vec3 p) {
  vec3 aCol = vec3(1. + 0.7*mod(floor(p.x) + floor(p.z), 2.0)) * 0.3;
  vec3 dCol = vec3(0.3);
  vec3 sCol = vec3(0);
  float a = 1.;

  return Material(aCol, dCol, sCol, a);
}

Material tieFighter() {
  vec3 aCol = 0.4 * vec3(0.2);
  vec3 dCol = 0.5 * vec3(0.3);
  vec3 sCol = 0.6 * vec3(0.7, 0.7, 0.7);
  float a = 5.;

  return Material(aCol, dCol, sCol, a);
}

// Tie Fighter SDF
float sdSphere(vec3 p, float r, vec3 offset, mat3 transform )
{
  p = (p - offset)*transform;
  return length(p) - r;
}

float sdHexPrism( vec3 p, vec2 h, vec3 offset, mat3 transform )
{
  p = (p - offset)*transform;

  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;
  vec2 d = vec2(
       length(p.xy-vec2(clamp(p.x,-k.z*h.x,k.z*h.x), h.x))*sign(p.y-h.x),
       p.z-h.y );
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdCappedCone( vec3 p, vec3 a, vec3 b, float ra, float rb, vec3 offset, mat3 transform )
{
  p = (p - offset)*transform;
  float rba  = rb-ra;
  float baba = dot(b-a,b-a);
  float papa = dot(p-a,p-a);
  float paba = dot(p-a,b-a)/baba;
  float x = sqrt( papa - paba*paba*baba );
  float cax = max(0.0,x-((paba<0.5)?ra:rb));
  float cay = abs(paba-0.5)-0.5;
  float k = rba*rba + baba;
  float f = clamp( (rba*(x-ra)+paba*baba)/k, 0.0, 1.0 );
  float cbx = x-ra - f*rba;
  float cby = paba - f;
  float s = (cbx<0.0 && cay<0.0) ? -1.0 : 1.0;
  return s*sqrt( min(cax*cax + cay*cay*baba,
                     cbx*cbx + cby*cby*baba) );
}

float sdRhombus( vec3 p, float la, float lb, float h, float ra, vec3 offset, mat3 transform )
{
    p = (p - offset)*transform;

    p = abs(p);
    float f = clamp( (la*p.x-lb*p.z+lb*lb)/(la*la+lb*lb), 0.0, 1.0 );
    vec2  w = p.xz - vec2(la,lb)*vec2(f,1.0-f);
    vec2  q = vec2( length(w)*sign(w.x)-ra, p.y-h);
    return min(max(q.x,q.y),0.0) + length(max(q,0.0));
}


float sdDeathStar( vec3 p2, float ra, float rb, float d, vec3 offset, mat3 transform  )
{
  p2 = (p2 - offset)*transform;
  float a = (ra*ra - rb*rb + d*d)/(2.0*d);
  float b = sqrt(max(ra*ra-a*a,0.0));

  vec2 p = vec2( p2.x, length(p2.yz) );
  if( p.x*b-p.y*a > d*max(b-p.y,0.0) )
    return length(p-vec2(a,b));
  else
    return max( (length(p            )-ra),
               -(length(p-vec2(d,0.0))-rb));
}

struct Surface {
  int id; // id of object
  float sd; // signed distance
  Material mat;
};


Surface opUnion(Surface obj1, Surface obj2) {
  if (obj2.sd < obj1.sd) return obj2;
  return obj1;
}

Surface opSubtraction( Surface obj1, Surface obj2 )
{
  if( obj2.sd > -obj1.sd ) return obj2;
  return obj1;
}

Surface sceneDeathStar( vec3 p, vec3 offset, mat3 transform )
{
  p = (p - offset)*transform;

  Surface sDeathStar = Surface( 0, sdDeathStar(p, 5.0, 2.0, 6.0, vec3(0.0,0.,0.0), rotateX(0.5)*rotateY(1.5 + sin(u_time/7.0)) ), tieFighter() );

  return sDeathStar;
}

Surface sceneTieFighter(vec3 p, vec3 offset, mat3 transform)
{
  p = (p - offset)*transform - vec3(-7.0,0.0,0.0) ;

  Surface co;
  Surface sTieFighterSphere = Surface(2, sdSphere(p, 0.4, vec3(0.0,0.5,0), identity() ) , tieFighter() ) ;
  Surface sTieFighterSphere2 = Surface(2, sdSphere(p, 0.3, vec3(0.0,0.5,0.12), identity() ) , tieFighter() ) ;
  Surface sTieFighterWingL = Surface(2, sdHexPrism(p, vec2(1.2,0.02), vec3(-1.,0.5,0.), rotateY(PI/2.0) ), tieFighter() );
  Surface sTieFighterWingR = Surface(2, sdHexPrism(p, vec2(1.2,0.02), vec3( 1.,0.5,0.), rotateY(PI/2.0) ), tieFighter() );
  Surface sTieFighterBodyL = Surface(2, sdCappedCone( p, vec3(-0.5,0.0,0.0), vec3(0.5,0.0,0.0), 0.1, 0.2, vec3(-0.5,0.5,0.0), identity() ), tieFighter() );
  Surface sTieFighterBodyR = Surface(2, sdCappedCone( p, vec3(-0.5,0.0,0.0), vec3(0.5,0.0,0.0), 0.2, 0.1, vec3( 0.5,0.5,0.0), identity() ), tieFighter() );
  Surface sTieFighterWingRibL0 = Surface(2, sdRhombus( p, 1.3, 0.04, 0.1, 0.01, vec3( -1.0,0.5,0.0), rotateZ(PI/2.0)*rotateY(PI/6.0) ), tieFighter() );
  Surface sTieFighterWingRibL1 = Surface(2, sdRhombus( p, 1.3, 0.04, 0.1, 0.01, vec3( -1.0,0.5,0.0), rotateZ(PI/2.0)*rotateY(PI/2.0) ), tieFighter() );
  Surface sTieFighterWingRibL2 = Surface(2, sdRhombus( p, 1.3, 0.04, 0.1, 0.01, vec3( -1.0,0.5,0.0), rotateZ(PI/2.0)*rotateY(-PI/6.0) ), tieFighter() );
  Surface sTieFighterWingRibR0 = Surface(2, sdRhombus( p, 1.3, 0.04, 0.1, 0.01, vec3( 1.0,0.5,0.0), rotateZ(PI/2.0)*rotateY(PI/6.0) ), tieFighter() );
  Surface sTieFighterWingRibR1 = Surface(2, sdRhombus( p, 1.3, 0.04, 0.1, 0.01, vec3( 1.0,0.5,0.0), rotateZ(PI/2.0)*rotateY(PI/2.0) ), tieFighter() );
  Surface sTieFighterWingRibR2 = Surface(2, sdRhombus( p, 1.3, 0.04, 0.1, 0.01, vec3( 1.0,0.5,0.0), rotateZ(PI/2.0)*rotateY(-PI/6.0) ), tieFighter() );


  co = opUnion(sTieFighterSphere, sTieFighterWingL);
  co = opUnion(co, sTieFighterSphere2);
  co = opUnion(co, sTieFighterWingR);
  co = opUnion(co, sTieFighterBodyL);
  co = opUnion(co, sTieFighterBodyR);
  co = opUnion(co, sTieFighterWingRibL0);
  co = opUnion(co, sTieFighterWingRibL1);
  co = opUnion(co, sTieFighterWingRibL2);
  co = opUnion(co, sTieFighterWingRibR0);
  co = opUnion(co, sTieFighterWingRibR1);
  co = opUnion(co, sTieFighterWingRibR2);

  return co;
}

Surface scene(vec3 p) {
//   Surface sFloor = Surface(1, p.y + 1., checkerboard(p));

  Surface sDeathStar = sceneDeathStar( p, vec3(0.,0.,-10.0), identity() ); 

  Surface sTieFighter = sceneTieFighter( p, vec3(6.,0.,6.), rotateY( -u_time ) );
//  Surface sTieFighter = sceneTieFighter( p, vec3(6.,0.,0.), rotateY( PI ) );

  Surface co = opUnion(sDeathStar, sTieFighter); // closest object
//  co = opUnion(co, sSphereSilver);



  return co;
//  return sDeathStar;
}

Surface rayMarch(vec3 ro, vec3 rd) {
  float depth = MIN_DIST;
  Surface co;

  for (int i = 0; i < MAX_MARCHING_STEPS; i++) {
    vec3 p = ro + depth * rd;
    co = scene(p);
    depth += co.sd;
    if (co.sd < PRECISION || depth > MAX_DIST) break;
  }

  co.sd = depth;

  return co;
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(1.0, -1.0) * 0.0005;
    return normalize(
      e.xyy * scene(p + e.xyy).sd +
      e.yyx * scene(p + e.yyx).sd +
      e.yxy * scene(p + e.yxy).sd +
      e.xxx * scene(p + e.xxx).sd);
}

mat3 camera(vec3 cameraPos, vec3 lookAtPoint) {
    vec3 cd = normalize(lookAtPoint - cameraPos); // camera direction
    vec3 cr = normalize(cross(vec3(0, 1, 0), cd)); // camera right
    vec3 cu = normalize(cross(cd, cr)); // camera up

    return mat3(-cr, cu, -cd);
}

vec3 phong(vec3 lightDir, vec3 normal, vec3 rd, Material mat) {
  // ambient
  vec3 ambient = mat.ambientColor;

  // diffuse
  float dotLN = clamp(dot(lightDir, normal), 0., 1.);
  vec3 diffuse = mat.diffuseColor * dotLN;

  // specular
  float dotRV = clamp(dot(reflect(lightDir, normal), -rd), 0., 1.);
  vec3 specular = mat.specularColor * pow(dotRV, mat.alpha);

  return ambient + diffuse + specular;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
  vec2 uv = (fragCoord-.5*u_resolution.xy)/u_resolution.y;
//  vec3 backgroundColor = mix(vec3(1, .341, .2), vec3(0, 1, 1), uv.y) * 1.6;
  vec3 backgroundColor = mix(vec3(0.5), vec3(0.,0.,0.), uv.y);
  vec3 col = vec3(0);

  vec3 lp = vec3(0); // lookat point (aka camera target)
  vec3 ro = vec3(0, 0, 18);

  vec3 rd = camera(ro, lp) * normalize(vec3(uv, -1)); // ray direction

  Surface co = rayMarch(ro, rd); // closest object

  if (co.sd > MAX_DIST) {
    col = backgroundColor;
  } else {
      vec3 p = ro + rd * co.sd; // point on surface found by ray marching
      vec3 normal = calcNormal(p); // surface normal

      // light #1
      vec3 lightPosition1 = vec3(-8., -6., -5.);
      vec3 lightDirection1 = normalize(lightPosition1 - p);
      float lightIntensity1 = 0.9;

      // light #2
      vec3 lightPosition2 = vec3(2., 2., 2.);
      vec3 lightDirection2 = normalize(lightPosition2 - p);
      float lightIntensity2 = 0.5;

      // final color of object
      col = lightIntensity1 * phong(lightDirection1, normal, rd, co.mat);
      col += lightIntensity2 * phong(lightDirection2, normal , rd, co.mat);
  }

  fragColor = vec4(col, 1.0);
}

// END SHADERTOY CODE


    void main() {
      mainImage(outColor, gl_FragCoord.xy);
    }
  `;

// setup GLSL program
// create vertex sahder
const vs = CTX_GL2.createShader( CTX_GL2.VERTEX_SHADER );
CTX_GL2.shaderSource( vs, vss );
CTX_GL2.compileShader(vs);
let success = CTX_GL2.getShaderParameter( vs, CTX_GL2.COMPILE_STATUS );
if(!success) throw new Error('-E- could not compile the vertex shader');

const fs = CTX_GL2.createShader( CTX_GL2.FRAGMENT_SHADER );
CTX_GL2.shaderSource( fs, fss );
CTX_GL2.compileShader(fs);
success = CTX_GL2.getShaderParameter( fs, CTX_GL2.COMPILE_STATUS );
if(!success) throw new Error('-E- could not compile the fragment shader');

let program = CTX_GL2.createProgram();
CTX_GL2.attachShader(program, vs);
CTX_GL2.attachShader(program, fs);
CTX_GL2.linkProgram(program);
success = CTX_GL2.getProgramParameter( program, CTX_GL2.LINK_STATUS );
if( !success ) throw new Error('-E- could not link the program');

// look up where the vertex data needs to go.
const attrib_loc_pos = CTX_GL2.getAttribLocation(program, "a_position");

// look up uniform locations
const uniform_loc_resolution = CTX_GL2.getUniformLocation(program, "u_resolution");
const uniform_loc_mouse = CTX_GL2.getUniformLocation(program, "u_mouse_pos");
const uniform_loc_time = CTX_GL2.getUniformLocation(program, "u_time");

// Create a vertex array object (attribute state)
const vao = CTX_GL2.createVertexArray();

// and make it the one we're currently working with
CTX_GL2.bindVertexArray(vao);

// Create a buffer to put three 2d clip space points in
const buffer_pos = CTX_GL2.createBuffer();

// Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = buffer_pos)
CTX_GL2.bindBuffer(CTX_GL2.ARRAY_BUFFER, buffer_pos);

// fill it with a 2 triangles that cover clip space
CTX_GL2.bufferData(CTX_GL2.ARRAY_BUFFER, new Float32Array([
  -1, -1,  // first triangle
  1, -1,
  -1,  1,
  -1,  1,  // second triangle
  1, -1,
  1,  1,
]), CTX_GL2.STATIC_DRAW);

// Turn on the attribute
CTX_GL2.enableVertexAttribArray(attrib_loc_pos);

// Tell the attribute how to get data out of buffer_pos (ARRAY_BUFFER)
CTX_GL2.vertexAttribPointer(
  attrib_loc_pos,
  2,          // 2 components per iteration
  CTX_GL2.FLOAT,   // the data is 32bit floats
  false,      // don't normalize the data
  0,          // 0 = move forward size * sizeof(type) each iteration to get the next position
  0,          // start at the beginning of the buffer
);


let mouseX = 0;
let mouseY = 0;

function setMousePosition(e) {
  mouseX = e.clientX;
  mouseY = e.clientY;  // bottom is 0 in WebGL
}

let then = 0;
let time = 0;

let t_start = 0;
let t_total = 0;

function render(t_now) {
  t_now *= 0.001;  // convert to seconds
//  const elapsedTime = Math.min(now - then, 0.1);
  const t_diff = t_now - t_start;
  t_total += t_diff;
  t_start = t_now;

  // Tell WebGL how to convert from clip space to pixels
  CTX_GL2.viewport(0, 0, CTX_GL2.canvas.width, CTX_GL2.canvas.height);

  // Tell it to use our program (pair of shaders)
  CTX_GL2.useProgram(program);

  // Bind the attribute/buffer set we want.
  CTX_GL2.bindVertexArray(vao);

  CTX_GL2.uniform2f(uniform_loc_resolution, CTX_GL2.canvas.width, CTX_GL2.canvas.height);
  CTX_GL2.uniform2f(uniform_loc_mouse, mouseX, mouseY);
  CTX_GL2.uniform1f(uniform_loc_time, t_total);

  CTX_GL2.drawArrays(
    CTX_GL2.TRIANGLES,
    0,     // offset
    6,     // num vertices to process
  );

  requestAnimationFrame(render);
}

requestAnimationFrame(render);


