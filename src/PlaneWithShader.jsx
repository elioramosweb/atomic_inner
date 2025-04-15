// SphereWithShader.jsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial } from 'three'
import { DoubleSide } from 'three'

const vertexShader = `
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    void main() {
        vNormal = normal;
        vPosition = position;
        vUv = uv;
        vec3 newPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`

const fragmentShader = `

  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  #define PI 3.141592653589793


  //////////////////////////////////////////////////////////////
  // definición de operaciones aritméticas con números complejos
  //////////////////////////////////////////////////////////////

  // algunas de ellas son adaptaciones del github de Johan Karlsson
  // https://gist.github.com/DonKarlssonSan

  #define cx_add(a, b) vec2(a.x + b.x, a.y + b.y)
  #define cx_sub(a, b) vec2(a.x - b.x, a.y - b.y)
  #define cx_mul(a, b) vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x)
  #define cx_div(a, b) vec2(((a.x * b.x + a.y * b.y) / (b.x * b.x + b.y * b.y)), ((a.y * b.x - a.x * b.y) / (b.x * b.x + b.y * b.y)))
  #define cx_modulus(a) length(a)
  #define cx_conj(a) vec2(a.x, -a.y)
  #define cx_arg(a) atan2(a.y, a.x)
  #define cx_sin(a) vec2(sin(a.x) * cosh(a.y), cos(a.x) * sinh(a.y))
  #define cx_cos(a) vec2(cos(a.x) * cosh(a.y), -sin(a.x) * sinh(a.y))
  #define hsv2rgb(v) abs(fract(v + vec3(3, 2, 1) / 3.) - .5) * 6. - 1.

  float hypot(vec2 z) {
    float x = abs(z.x);
    float y = abs(z.y);
    float t = min(x, y);
    x = max(x, y);
    t = t / x;
    return x * sqrt(1.0 + t * t);

    // This conditional seems unnecessary on the non-cpu version
    //return (z.x == 0.0 && z.y == 0.0) ? 0.0 : x * sqrt(1.0 + t * t);
  }

  

  /////////////////////
  // tangente compleja 
  /////////////////////
  
  vec2 cx_tan(vec2 a) {return cx_div(cx_sin(a), cx_cos(a)); }

  ////////////////////
  // potencia compleja
  ////////////////////

  vec2 cx_pow(vec2 a, vec2 b) {
    float aarg = atan(a.y, a.x);
    float amod = hypot(a);

    float theta = log(amod) * b.y + aarg * b.x;

    return vec2(
      cos(theta),
      sin(theta)
    ) * pow(amod, b.x) * exp(-aarg * b.y);
  }

  ///////////////////////
  // exponencial compleja
  ///////////////////////

  vec2 cx_exp(vec2 z) {
    return vec2(cos(z.y), sin(z.y)) * exp(z.x);
  }

  /////////////////////
  // conversión a polar
  /////////////////////

  vec2 as_polar(vec2 z) {
    return vec2(
      length(z),
      atan(z.y, z.x)
    );
  }

  /////////////////////
  // logaritmo complejo
  /////////////////////

  vec2 cx_log(vec2 a) {
    vec2 polar = as_polar(a);
    float rpart = polar.x;
    float ipart = polar.y;
    if (ipart > PI) ipart = ipart - (2.0 * PI);
    return vec2(log(rpart), ipart);
  }

  ///////////////////////////////////////////////
  // para generar paletas de colores cosenoidales
  ///////////////////////////////////////////////

  vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(0.38*2.*PI * (c * t + d));
  }

  //////////////////////////
  // función de map genérica
  //////////////////////////

  float map(float value, float min1, float max1, float min2, float max2) {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
  }

  float rand(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p){
	vec2 ip = floor(p);
	vec2 u = fract(p);
	u = u*u*(3.0-2.0*u);
	
	float res = mix(
		mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
		mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
	return res*res;
}



  #define IMAX 10.0

  /////////////////////////////////
  // atomic singular inner function
  /////////////////////////////////

  vec2 atomic(vec2 z)
  {
    //float par = mod(u_time*0.0,10.0);
    vec2 omega = cx_exp(vec2(0.0,2.0*PI/3.0));
    vec2 temp = vec2(1.0);
    
    for(float k=1.0;k <= IMAX;k+=1.0)
    {
        vec2 num = z + vec2(cx_pow(omega,vec2(k,0.0)));
        vec2 den = z - vec2(cx_pow(omega,vec2(k,0.0)));
        temp = cx_mul(cx_exp(cx_div(num,den)),temp);
    }

    return temp;
  }


  ///////////////////////////////////////////////////////////////////
  // para transfomar la función y añadir efecto de líneas de contorno
  ///////////////////////////////////////////////////////////////////

  vec2 g(vec2 f)
  {
    return ceil(cx_log(f)) - log(abs(f)); 
  }



  ///////////////////////////////////////////////////////////////////////
  // definición de varias paletas de colores basadas en la función coseno
  ///////////////////////////////////////////////////////////////////////

  vec3 pal1(float par)
  {
    return palette(par,vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67));
  }

  vec3 pal2(float par)
  {
    return palette(par,vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.00, 0.10, 0.20));
  }

  vec3 pal3(float par)
  {
    return palette(par,vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.30, 0.20, 0.20));
  }

  vec3 pal4(float par)
  {
    return palette(par,vec3(0.5, 0.5, 0.5),vec3(0.5, 0.5, 0.5),vec3(1.0, 1.0, 0.5),vec3(0.80, 0.90, 0.30));
  }

  vec3 pal5(float par)
  {
    return palette(par,vec3(0.5, 0.5, 0.5),vec3(0.5, 0.5, 0.5),vec3(1.0, 0.7, 0.4),vec3(0.00, 0.15, 0.20));
  }

  vec3 pal6(float par)
  {
    return palette(par,vec3(0.5, 0.5, 0.5),vec3(0.5, 0.5, 0.5),vec3(2.0, 1.0, 0.0),vec3(0.50, 0.20, 0.25));
  }

  vec3 pal7(float par)
  {
    return palette(par,vec3(0.8, 0.5, 0.4),vec3(0.2, 0.4, 0.2),vec3(2.0, 1.0, 1.0), vec3(0.00, 0.25, 0.25));
  }

  mat2 rotate2d(float _angle){
      return mat2(cos(_angle),-sin(_angle),
                  sin(_angle),cos(_angle));
  }


  /////////////////////
  // programa principal 
  /////////////////////

  void main() {

      vec2 st = vec2(fract(vUv.x + uTime * 0.0), vUv.y);
      st = st - 0.5;
      st *= 6.0;
      //st *= rotate2d(uTime*0.01);
      vec2 z = st;
      vec2 f = g(atomic(z + 0.2*noise(uTime*0.1*z)));


      vec2 zpolar = as_polar(f);
      float phase = f.y;  
      float mag   = f.x;
      phase = map(phase,-PI/2.0,PI/2.0,0.0,1.0);
      vec3 col1 = pal2(phase);
      vec3 col2 = pal3(mag);
      vec3 col = mix(col1,col2,0.5);
      //vec3 col = vec3(phase);
      gl_FragColor = vec4(col,1.0);
  }
`

export default function PlaneWithShader() {
  const shaderRef = useRef();

  useFrame(({ clock }) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = clock.getElapsedTime()
    }
  })

  return (
    <mesh position={[0,0,0]}>
      <planeGeometry args={[5, 5,128, 128]} />
      <shaderMaterial
        ref={shaderRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 }
        }}
        side={DoubleSide}
      />
    </mesh>
  )
}
